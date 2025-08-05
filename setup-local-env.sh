#!/bin/bash

# Color codes for better output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Function to check for required commands ---
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Erro: O comando '$1' não foi encontrado. Por favor, instale-o antes de continuar.${NC}"
        exit 1
    fi
}

# --- Main Script ---
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}===  Script de Configuração do Ambiente Local  ===${NC}"
echo -e "${GREEN}===        IA Threat Modeling                 ===${NC}"
echo -e "${GREEN}=====================================================${NC}"

# 1. Check for dependencies
echo -e "\n${YELLOW}1. Verificando dependências (Node, NPM, AWS CLI)...${NC}"
check_command "node"
check_command "npm"
check_command "aws"
echo -e "${GREEN}   ... Dependências encontradas!${NC}"

# 2. Gather user input
echo -e "\n${YELLOW}2. Insira as informações do ambiente.${NC}"
aws_region=$(aws configure get region)
if [ -z "$aws_region" ]; then
    echo -e "${RED}Erro: A região da AWS não está configurada no seu perfil default. Por favor, configure-a usando 'aws configure'.${NC}"
    exit 1
else
    echo -e "   -> Usando a região do perfil default da AWS: ${GREEN}${aws_region}${NC}"
fi
read -p "   -> Nome do ambiente local (ex: dev, test): " env_name

echo -e "${GREEN}   ... Usando o perfil default da AWS para criar os recursos.${NC}"

# 3. Create AWS Resources
echo -e "\n${YELLOW}3. Criando recursos na AWS (S3 e DynamoDB)...${NC}"

# Create S3 Bucket
s3_bucket_name="ia-threat-modeling-uploads-${env_name}-$(openssl rand -hex 4)"
echo "   -> Criando S3 bucket: ${s3_bucket_name}..."

location_constraint=""
if [ "$aws_region" != "us-east-1" ]; then
    location_constraint="--create-bucket-configuration LocationConstraint=$aws_region"
fi

if aws s3api create-bucket --bucket "$s3_bucket_name" --region "$aws_region" $location_constraint > /dev/null; then
    echo -e "${GREEN}      ... Bucket S3 criado.${NC}"
else
    echo -e "${RED}      ... Falha ao criar o bucket S3. Verifique suas permissões e se o perfil 'default' da AWS CLI está configurado.${NC}"
    exit 1
fi

# Create DynamoDB Table
dynamodb_table_name="ia-threat-modeling-history-${env_name}"
echo "   -> Criando tabela DynamoDB: ${dynamodb_table_name}..."
if aws dynamodb create-table \
    --table-name "$dynamodb_table_name" \
    --attribute-definitions AttributeName=analysisId,AttributeType=S \
    --key-schema AttributeName=analysisId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST > /dev/null; then
    echo -e "${GREEN}      ... Tabela DynamoDB criada.${NC}"
else
    echo -e "${RED}      ... Falha ao criar a tabela DynamoDB. Verifique suas permissões e se o perfil 'default' da AWS CLI está configurado.${NC}"
    exit 1
fi

# 4. Create .env file
echo -e "\n${YELLOW}4. Gerando o arquivo .env...${NC}"
cat > .env << EOL
AWS_REGION=${aws_region}
DYNAMODB_TABLE_NAME=${dynamodb_table_name}
S3_BUCKET_NAME=${s3_bucket_name}
EOL
echo -e "${GREEN}   ... Arquivo .env criado com sucesso!${NC}"

# 5. Install dependencies
echo -e "\n${YELLOW}5. Instalando dependências do NPM...${NC}"
npm install

# 6. Final Instructions
echo -e "\n${GREEN}=====================================================${NC}"
echo -e "${GREEN}===          Configuração Concluída!          ===${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo -e "\nPara iniciar a aplicação, abra ${YELLOW}DOIS TERMINAIS${NC}:\n"
echo -e "   -> No ${YELLOW}Terminal 1${NC}, execute o servidor backend:\n      ${GREEN}npm run start${NC}\n"
echo -e "   -> No ${YELLOW}Terminal 2${NC}, execute o servidor de desenvolvimento do frontend:\n      ${GREEN}npm run dev${NC}\n"
echo -e "A aplicação estará disponível em: ${YELLOW}http://localhost:5173${NC}"
echo -e "\nPara limpar os recursos criados, você pode deletar o bucket S3 e a tabela DynamoDB no console da AWS."