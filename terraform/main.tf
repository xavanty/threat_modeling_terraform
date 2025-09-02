terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "The AWS region to deploy to."
  type        = string
  default     = "sa-east-1"
}

variable "app_name" {
  description = "The name of the application."
  type        = string
  default     = "ia-threat-modeling"
}

variable "image_tag" {
  description = "The Docker image tag to deploy."
  type        = string
  default     = "latest"
}

# S3 Bucket for storing uploaded images
resource "aws_s3_bucket" "uploads" {
  bucket = "${var.app_name}-uploads-${random_id.id.hex}"

  tags = {
    Name = "${var.app_name}-uploads"
  }
}

resource "aws_s3_bucket_public_access_block" "uploads_public_access" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}


# DynamoDB table for storing analysis history
resource "aws_dynamodb_table" "history" {
  name           = "${var.app_name}-history"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "analysisId"

  attribute {
    name = "analysisId"
    type = "S"
  }

  tags = {
    Name = "${var.app_name}-history"
  }
}

# VPC for ECS
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.app_name}-vpc"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.app_name}-igw"
  }
}

# Public Subnets
resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.app_name}-public-${count.index + 1}"
  }
}

# Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.app_name}-public"
  }
}

# Route Table Association
resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Security Group for ECS Service
resource "aws_security_group" "ecs_service" {
  name        = "${var.app_name}-ecs-service"
  description = "Security group for ECS service"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 8082
    to_port     = 8082
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-ecs-service"
  }
}

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.app_name}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Role for ECS Task
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.app_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Policy for Bedrock, S3, and DynamoDB
resource "aws_iam_policy" "app_permissions" {
  name        = "${var.app_name}-permissions-policy"
  description = "Allows access to Bedrock, S3, and DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "bedrock:InvokeModel"
        Effect   = "Allow"
        Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
      },
      {
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Effect   = "Allow"
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:DeleteItem"
        ]
        Effect   = "Allow"
        Resource = aws_dynamodb_table.history.arn
      }
    ]
  })
}

# Attach ECS Task Execution Role Policy
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Attach the app permissions policy to the ECS task role
resource "aws_iam_role_policy_attachment" "app_permissions_attachment" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.app_permissions.arn
}

# ECR Repository
resource "aws_ecr_repository" "app" {
  name                 = var.app_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = var.app_name
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = var.app_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = var.app_name
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.app_name}"
  retention_in_days = 7

  tags = {
    Name = var.app_name
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "main" {
  family                   = var.app_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = var.app_name
      image = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"

      portMappings = [
        {
          containerPort = 8082
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "DYNAMODB_TABLE_NAME"
          value = aws_dynamodb_table.history.name
        },
        {
          name  = "S3_BUCKET_NAME"
          value = aws_s3_bucket.uploads.bucket
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "PORT"
          value = "8082"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8082/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      essential = true
    }
  ])

  tags = {
    Name = var.app_name
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = var.app_name
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = false

  tags = {
    Name = var.app_name
  }
}

# Security Group for ALB
resource "aws_security_group" "alb" {
  name        = "${var.app_name}-alb"
  description = "Security group for ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-alb"
  }
}

# Target Group
resource "aws_lb_target_group" "main" {
  name        = var.app_name
  port        = 8082
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  tags = {
    Name = var.app_name
  }
}

# Cognito User Pool
resource "aws_cognito_user_pool" "main" {
  name = "${var.app_name}-user-pool"

  # Password policy
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # Username configuration
  username_attributes = ["email"]
  
  # Auto-verified attributes
  auto_verified_attributes = ["email"]

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # User pool add-ons
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  # Attributes
  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "email"
    required                 = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "name"
    required                 = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = {
    Name = "${var.app_name}-user-pool"
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.app_name}-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # OAuth configuration
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = ["http://${aws_lb.main.dns_name}/oauth2/idpresponse"]
  logout_urls                          = ["http://${aws_lb.main.dns_name}/"]

  # Token configuration
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Security configuration
  generate_secret               = true
  prevent_user_existence_errors = "ENABLED"
  
  # Explicit auth flows
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
}

# Cognito User Pool Domain
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.app_name}-${random_id.id.hex}"
  user_pool_id = aws_cognito_user_pool.main.id
}

# IAM Role for Cognito Administrators Group
resource "aws_iam_role" "cognito_admin_role" {
  name = "${var.app_name}-cognito-admin-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_user_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.app_name}-cognito-admin-role"
  }
}

# IAM Role for Cognito Users Group
resource "aws_iam_role" "cognito_user_role" {
  name = "${var.app_name}-cognito-user-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_user_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.app_name}-cognito-user-role"
  }
}

# IAM Policy for Administrators (full access)
resource "aws_iam_policy" "admin_permissions" {
  name        = "${var.app_name}-admin-permissions"
  description = "Full permissions for administrators"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "s3:*",
          "dynamodb:*"
        ]
        Resource = [
          "arn:aws:bedrock:${var.aws_region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
          aws_s3_bucket.uploads.arn,
          "${aws_s3_bucket.uploads.arn}/*",
          aws_dynamodb_table.history.arn
        ]
      }
    ]
  })
}

# IAM Policy for Regular Users (limited access)
resource "aws_iam_policy" "user_permissions" {
  name        = "${var.app_name}-user-permissions"
  description = "Limited permissions for regular users"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.history.arn
        Condition = {
          "ForAllValues:StringEquals" = {
            "dynamodb:Attributes" = ["analysisId", "title", "createdAt", "analysisResult", "aiDescription", "dfdDescription", "originalDescription", "appType", "dataClassification", "s3Key"]
          }
        }
      }
    ]
  })
}

# Attach policies to roles
resource "aws_iam_role_policy_attachment" "admin_permissions_attachment" {
  role       = aws_iam_role.cognito_admin_role.name
  policy_arn = aws_iam_policy.admin_permissions.arn
}

resource "aws_iam_role_policy_attachment" "user_permissions_attachment" {
  role       = aws_iam_role.cognito_user_role.name
  policy_arn = aws_iam_policy.user_permissions.arn
}

# Cognito User Pool Groups
resource "aws_cognito_user_pool_group" "administrators" {
  name         = "Administrators"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Administrators with full access to the threat modeling application"
  precedence   = 1
  role_arn     = aws_iam_role.cognito_admin_role.arn
}

resource "aws_cognito_user_pool_group" "users" {
  name         = "Users"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Regular users with limited access to the threat modeling application"
  precedence   = 2
  role_arn     = aws_iam_role.cognito_user_role.arn
}

# ALB Listener with Cognito Authentication
resource "aws_lb_listener" "main" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "authenticate-cognito"
    
    authenticate_cognito {
      user_pool_arn       = aws_cognito_user_pool.main.arn
      user_pool_client_id = aws_cognito_user_pool_client.main.id
      user_pool_domain    = aws_cognito_user_pool_domain.main.domain
      
      # Optional: customize authentication behavior
      authentication_request_extra_params = {
        display = "page"
        prompt  = "login"
      }
      
      # Session management
      session_cookie_name = "AWSELBAuthSessionCookie"
      session_timeout     = 604800 # 7 days
      
      # What to do after authentication
      on_unauthenticated_request = "authenticate"
    }
  }

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}

# ECS Service
resource "aws_ecs_service" "main" {
  name            = var.app_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_service.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = var.app_name
    container_port   = 8082
  }

  depends_on = [aws_lb_listener.main]

  tags = {
    Name = var.app_name
  }
}

# Random ID for unique bucket name
resource "random_id" "id" {
  byte_length = 8
}

output "application_url" {
  description = "The URL of the Application Load Balancer"
  value       = "http://${aws_lb.main.dns_name}"
}

output "ecr_repository_url" {
  description = "The URL of the ECR repository"
  value       = aws_ecr_repository.app.repository_url
}

output "s3_bucket_name" {
  description = "The name of the S3 bucket"
  value       = aws_s3_bucket.uploads.bucket
}

output "dynamodb_table_name" {
  description = "The name of the DynamoDB table"
  value       = aws_dynamodb_table.history.name
}

output "ecs_cluster_name" {
  description = "The name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "The name of the ECS service"
  value       = aws_ecs_service.main.name
}

output "cognito_user_pool_id" {
  description = "The ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  description = "The ID of the Cognito User Pool Client"
  value       = aws_cognito_user_pool_client.main.id
}

output "cognito_domain" {
  description = "The Cognito domain URL"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "login_url" {
  description = "Direct login URL for the application"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/login?client_id=${aws_cognito_user_pool_client.main.id}&response_type=code&scope=email+openid+profile&redirect_uri=http://${aws_lb.main.dns_name}/oauth2/idpresponse"
}

output "cognito_admin_group" {
  description = "The name of the Cognito Administrators group"
  value       = aws_cognito_user_pool_group.administrators.name
}

output "cognito_users_group" {
  description = "The name of the Cognito Users group" 
  value       = aws_cognito_user_pool_group.users.name
}
