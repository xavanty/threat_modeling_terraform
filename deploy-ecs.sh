#!/bin/bash

# Deploy script for ECS deployment
set -e

# Variables
REGION=${AWS_REGION:-sa-east-1}
APP_NAME=${APP_NAME:-ia-threat-modeling}
IMAGE_TAG=${IMAGE_TAG:-latest}

echo "🚀 Starting ECS deployment process..."

# Check if required tools are installed
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI is required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "❌ Terraform is required but not installed. Aborting." >&2; exit 1; }

# Step 1: Apply Terraform to create infrastructure
echo "📦 Applying Terraform configuration..."
cd terraform
terraform init
terraform apply -auto-approve \
  -var="aws_region=$REGION" \
  -var="app_name=$APP_NAME" \
  -var="image_tag=$IMAGE_TAG"

# Get ECR repository URL from Terraform output
ECR_REPO=$(terraform output -raw ecr_repository_url)
echo "🏗️  ECR Repository: $ECR_REPO"

cd ..

# Step 2: Build and push Docker image
echo "🐳 Building Docker image..."
docker build -t $APP_NAME:$IMAGE_TAG .

# Tag for ECR
docker tag $APP_NAME:$IMAGE_TAG $ECR_REPO:$IMAGE_TAG

# Login to ECR
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REPO

# Push to ECR
echo "⬆️  Pushing image to ECR..."
docker push $ECR_REPO:$IMAGE_TAG

# Step 3: Update ECS service to use new image
echo "🔄 Updating ECS service..."
cd terraform

# Force new deployment
ECS_CLUSTER=$(terraform output -raw ecs_cluster_name)
ECS_SERVICE=$(terraform output -raw ecs_service_name)

aws ecs update-service \
  --region $REGION \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE \
  --force-new-deployment

echo "⏳ Waiting for deployment to complete..."
aws ecs wait services-stable \
  --region $REGION \
  --cluster $ECS_CLUSTER \
  --services $ECS_SERVICE

# Get outputs from Terraform
APP_URL=$(terraform output -raw application_url)
COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
COGNITO_DOMAIN=$(terraform output -raw cognito_domain)
LOGIN_URL=$(terraform output -raw login_url)

# Step 4: Create admin user (optional)
echo ""
read -p "🔐 Do you want to create an admin user? (y/n): " CREATE_ADMIN
if [[ $CREATE_ADMIN =~ ^[Yy]$ ]]; then
    read -p "📧 Enter admin email: " ADMIN_EMAIL
    read -s -p "🔒 Enter admin password (min 8 chars, must contain uppercase, lowercase, number, and symbol): " ADMIN_PASSWORD
    echo ""
    
    echo "👤 Creating admin user..."
    aws cognito-idp admin-create-user \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$ADMIN_EMAIL" \
        --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=name,Value="Administrator" Name=email_verified,Value=true \
        --temporary-password "$ADMIN_PASSWORD" \
        --message-action SUPPRESS

    # Set permanent password
    aws cognito-idp admin-set-user-password \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$ADMIN_EMAIL" \
        --password "$ADMIN_PASSWORD" \
        --permanent

    # Add user to Administrators group
    echo "🔑 Adding user to Administrators group..."
    aws cognito-idp admin-add-user-to-group \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$ADMIN_EMAIL" \
        --group-name "Administrators"

    echo "✅ Admin user created successfully and added to Administrators group!"
fi

echo ""
echo "✅ Deployment completed successfully!"
echo "🌐 Application URL: $APP_URL"
echo "🔐 Login URL: $LOGIN_URL"
echo "👤 Cognito Console: https://console.aws.amazon.com/cognito/users/?region=$REGION#/pool/$COGNITO_USER_POOL_ID/users"
echo "📊 ECS Cluster: $ECS_CLUSTER"
echo "🚀 ECS Service: $ECS_SERVICE"
echo ""
echo "🔒 Authentication is now REQUIRED to access the application!"
echo "📝 To access the app:"
echo "   1. Go to: $APP_URL"
echo "   2. You'll be redirected to Cognito login"
echo "   3. Sign in with your credentials"
echo "   4. After login, you'll be redirected back to the app"
echo ""
echo "👥 To create more users, use the Cognito console:"
echo "https://console.aws.amazon.com/cognito/users/?region=$REGION#/pool/$COGNITO_USER_POOL_ID/users"
echo ""
echo "You can monitor the deployment in the AWS Console:"
echo "https://console.aws.amazon.com/ecs/home?region=$REGION#/clusters/$ECS_CLUSTER/services"