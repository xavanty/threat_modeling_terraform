# Use a Node.js base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the React application (this creates the 'dist' folder)
RUN npm run build

# Expose the port the app runs on
EXPOSE 8081

# Command to run the application
CMD ["node", "server.js"]
