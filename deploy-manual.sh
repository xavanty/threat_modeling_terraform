#!/bin/bash
set -e

# Configurações
APP_NAME="ia-threat-modeling"
AWS_REGION="us-east-1"
IMAGE_TAG="latest"

echo "🚀 Iniciando deploy manual para AWS App Runner..."

# 1. Verificar se AWS CLI está configurado
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS CLI não está configurado. Execute: aws configure"
    exit 1
fi

echo "✅ AWS CLI configurado"

# 2. Deploy da infraestrutura com Terraform
echo "📦 Criando infraestrutura com Terraform..."
cd terraform
terraform init
terraform apply -auto-approve
cd ..

# 3. Obter URL do ECR
ECR_URL=$(aws ecr describe-repositories --repository-names $APP_NAME --query 'repositories[0].repositoryUri' --output text --region $AWS_REGION)
echo "📋 ECR Repository: $ECR_URL"

# 4. Login no ECR
echo "🔐 Fazendo login no ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URL

# 5. Build e push da imagem Docker
echo "🔨 Construindo imagem Docker..."
docker build -t $ECR_URL:$IMAGE_TAG .
docker tag $ECR_URL:$IMAGE_TAG $ECR_URL:latest

echo "📤 Enviando imagem para ECR..."
docker push $ECR_URL:$IMAGE_TAG
docker push $ECR_URL:latest

# 6. Forçar deploy no App Runner
echo "🔄 Iniciando deploy no App Runner..."
SERVICE_ARN=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='$APP_NAME'].ServiceArn" --output text --region $AWS_REGION)

if [ -n "$SERVICE_ARN" ]; then
    aws apprunner start-deployment --service-arn $SERVICE_ARN --region $AWS_REGION
    echo "✅ Deploy iniciado para o serviço: $SERVICE_ARN"
    
    # Obter URL do App Runner
    APP_URL=$(aws apprunner describe-service --service-arn $SERVICE_ARN --query 'Service.ServiceUrl' --output text --region $AWS_REGION)
    echo "🌐 Aplicação disponível em: https://$APP_URL"
else
    echo "❌ Serviço App Runner não encontrado"
    exit 1
fi

echo "🎉 Deploy concluído com sucesso!"