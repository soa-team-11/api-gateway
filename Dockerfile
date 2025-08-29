# Use Node 18 (lightweight alpine image)
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the code
COPY . .

# Expose the port the app runs on
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
