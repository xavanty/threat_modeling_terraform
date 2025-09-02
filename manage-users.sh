#!/bin/bash

# User management script for Cognito
set -e

# Variables
REGION=${AWS_REGION:-sa-east-1}
APP_NAME=${APP_NAME:-ia-threat-modeling}

# Check if Terraform outputs exist
if [ ! -d "terraform" ]; then
    echo "❌ Terraform directory not found. Run from project root."
    exit 1
fi

cd terraform

# Check if Terraform state exists
if ! terraform show &>/dev/null; then
    echo "❌ No Terraform state found. Deploy the infrastructure first with ./deploy-ecs.sh"
    exit 1
fi

# Get Cognito User Pool ID
COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null)
if [ -z "$COGNITO_USER_POOL_ID" ]; then
    echo "❌ Could not get Cognito User Pool ID from Terraform outputs"
    exit 1
fi

cd ..

echo "👥 Cognito User Management"
echo "=========================="
echo "User Pool ID: $COGNITO_USER_POOL_ID"
echo "Region: $REGION"
echo ""

# Function to create user
create_user() {
    echo "📝 Creating new user..."
    read -p "📧 Enter email: " USER_EMAIL
    read -p "👤 Enter name: " USER_NAME
    read -s -p "🔒 Enter password (min 8 chars, uppercase, lowercase, number, symbol): " USER_PASSWORD
    echo ""
    
    echo "👥 Select user type:"
    echo "1) Administrator (full access)"
    echo "2) Regular User (limited access)"
    read -p "Select type (1-2): " USER_TYPE
    
    case $USER_TYPE in
        1)
            GROUP_NAME="Administrators"
            USER_ROLE="Administrator"
            ;;
        2)
            GROUP_NAME="Users"
            USER_ROLE="User"
            ;;
        *)
            echo "❌ Invalid selection. Defaulting to Regular User."
            GROUP_NAME="Users"
            USER_ROLE="User"
            ;;
    esac
    
    echo "👤 Creating user $USER_EMAIL as $USER_ROLE..."
    
    # Create user
    aws cognito-idp admin-create-user \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$USER_EMAIL" \
        --user-attributes Name=email,Value="$USER_EMAIL" Name=name,Value="$USER_NAME" Name=email_verified,Value=true \
        --temporary-password "$USER_PASSWORD" \
        --message-action SUPPRESS

    # Set permanent password
    aws cognito-idp admin-set-user-password \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$USER_EMAIL" \
        --password "$USER_PASSWORD" \
        --permanent

    # Add user to appropriate group
    echo "🔑 Adding user to $GROUP_NAME group..."
    aws cognito-idp admin-add-user-to-group \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$USER_EMAIL" \
        --group-name "$GROUP_NAME"

    echo "✅ User $USER_EMAIL created successfully as $USER_ROLE!"
}

# Function to list users
list_users() {
    echo "📋 Current users:"
    echo ""
    aws cognito-idp list-users \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --query 'Users[*].{Username:Username,Email:Attributes[?Name==`email`].Value|[0],Name:Attributes[?Name==`name`].Value|[0],Status:UserStatus,Created:UserCreateDate}' \
        --output table
    
    echo ""
    echo "👥 Group memberships:"
    echo ""
    
    # List Administrators
    echo "🔑 Administrators:"
    aws cognito-idp list-users-in-group \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --group-name "Administrators" \
        --query 'Users[*].{Username:Username,Email:Attributes[?Name==`email`].Value|[0],Name:Attributes[?Name==`name`].Value|[0]}' \
        --output table || echo "   (none)"
    
    echo ""
    echo "👤 Regular Users:"
    aws cognito-idp list-users-in-group \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --group-name "Users" \
        --query 'Users[*].{Username:Username,Email:Attributes[?Name==`email`].Value|[0],Name:Attributes[?Name==`name`].Value|[0]}' \
        --output table || echo "   (none)"
}

# Function to delete user
delete_user() {
    echo "🗑️  Deleting user..."
    read -p "📧 Enter email of user to delete: " USER_EMAIL
    
    read -p "⚠️  Are you sure you want to delete user $USER_EMAIL? (y/N): " CONFIRM
    if [[ $CONFIRM =~ ^[Yy]$ ]]; then
        aws cognito-idp admin-delete-user \
            --region $REGION \
            --user-pool-id $COGNITO_USER_POOL_ID \
            --username "$USER_EMAIL"
        
        echo "✅ User $USER_EMAIL deleted successfully!"
    else
        echo "❌ Operation cancelled."
    fi
}

# Function to reset password
reset_password() {
    echo "🔄 Resetting user password..."
    read -p "📧 Enter email: " USER_EMAIL
    read -s -p "🔒 Enter new password: " NEW_PASSWORD
    echo ""
    
    aws cognito-idp admin-set-user-password \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$USER_EMAIL" \
        --password "$NEW_PASSWORD" \
        --permanent

    echo "✅ Password reset for $USER_EMAIL successfully!"
}

# Function to change user group
change_user_group() {
    echo "🔄 Changing user group..."
    read -p "📧 Enter email: " USER_EMAIL
    
    # Show current groups
    echo "📋 Current groups for $USER_EMAIL:"
    aws cognito-idp admin-list-groups-for-user \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$USER_EMAIL" \
        --query 'Groups[*].{GroupName:GroupName,Description:Description}' \
        --output table 2>/dev/null || echo "   (none or user not found)"
    
    echo ""
    echo "👥 Select new group:"
    echo "1) Administrators (full access)"
    echo "2) Users (limited access)"
    read -p "Select group (1-2): " NEW_GROUP_TYPE
    
    case $NEW_GROUP_TYPE in
        1)
            NEW_GROUP="Administrators"
            OLD_GROUP="Users"
            ;;
        2)
            NEW_GROUP="Users"
            OLD_GROUP="Administrators"
            ;;
        *)
            echo "❌ Invalid selection."
            return
            ;;
    esac
    
    # Remove from old group (ignore errors if not in group)
    echo "🔄 Removing from $OLD_GROUP group..."
    aws cognito-idp admin-remove-user-from-group \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$USER_EMAIL" \
        --group-name "$OLD_GROUP" 2>/dev/null || true
    
    # Add to new group
    echo "🔑 Adding to $NEW_GROUP group..."
    aws cognito-idp admin-add-user-to-group \
        --region $REGION \
        --user-pool-id $COGNITO_USER_POOL_ID \
        --username "$USER_EMAIL" \
        --group-name "$NEW_GROUP"
    
    echo "✅ User $USER_EMAIL moved to $NEW_GROUP group!"
}

# Main menu
while true; do
    echo ""
    echo "What would you like to do?"
    echo "1) List users and groups"
    echo "2) Create user" 
    echo "3) Delete user"
    echo "4) Reset password"
    echo "5) Change user group"
    echo "6) Open Cognito Console"
    echo "7) Exit"
    echo ""
    read -p "Select option (1-7): " OPTION

    case $OPTION in
        1)
            list_users
            ;;
        2)
            create_user
            ;;
        3)
            delete_user
            ;;
        4)
            reset_password
            ;;
        5)
            change_user_group
            ;;
        6)
            echo "🌐 Opening Cognito Console..."
            echo "https://console.aws.amazon.com/cognito/users/?region=$REGION#/pool/$COGNITO_USER_POOL_ID/users"
            ;;
        7)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo "❌ Invalid option. Please select 1-7."
            ;;
    esac
done