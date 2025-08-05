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
  default     = "us-east-1"
}

variable "app_name" {
  description = "The name of the application."
  type        = string
  default     = "ia-threat-modeling"
}

variable "github_connection_arn" {
  description = "The ARN of the AWS CodeStar connection to GitHub."
  type        = string
}

variable "github_repo" {
  description = "The GitHub repository to deploy from."
  type        = string
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

# IAM Role for App Runner
resource "aws_iam_role" "apprunner_instance_role" {
  name = "${var.app_name}-instance-role"

  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = {
          Service = "tasks.apprunner.amazonaws.com"
        }
      },
    ]
  })
}

# IAM Policy for Bedrock, S3, and DynamoDB
resource "aws_iam_policy" "app_permissions" {
  name        = "${var.app_name}-permissions-policy"
  description = "Allows access to Bedrock, S3, and DynamoDB"

  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [
      {
        Action   = "bedrock:InvokeModel"
        Effect   = "Allow"
        Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
      },
      {
        Action   = "s3:PutObject"
        Effect   = "Allow"
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Action   = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:Query"
        ]
        Effect   = "Allow"
        Resource = aws_dynamodb_table.history.arn
      }
    ]
  })
}

# Attach the policy to the role
resource "aws_iam_role_policy_attachment" "app_permissions_attachment" {
  role       = aws_iam_role.apprunner_instance_role.name
  policy_arn = aws_iam_policy.app_permissions.arn
}

# App Runner Service
resource "aws_apprunner_service" "main" {
  service_name = var.app_name

  source_configuration {
    authentication_configuration {
      connection_arn = var.github_connection_arn
    }
    code_repository {
      repository_url = "https://github.com/${var.github_repo}"
      source_code_version {
        type  = "BRANCH"
        value = "main"
      }
    }
    auto_deployments_enabled = true
  }

  health_check_configuration {
    protocol = "HTTP"
    path = "/health"
  }

  instance_configuration {
    cpu    = "1024"
    memory = "2048"
    instance_role_arn = aws_iam_role.apprunner_instance_role.arn
  }

  # Pass resource names as environment variables
  runtime_environment_variables = {
    DYNAMODB_TABLE_NAME = aws_dynamodb_table.history.name
    S3_BUCKET_NAME      = aws_s3_bucket.uploads.bucket
    AWS_REGION          = var.aws_region
  }

  tags = {
    Name = var.app_name
  }
}

# Random ID for unique bucket name
resource "random_id" "id" {
  byte_length = 8
}

output "apprunner_url" {
  value = aws_apprunner_service.main.service_url
}

output "s3_bucket_name" {
  value = aws_s3_bucket.uploads.bucket
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.history.name
}
