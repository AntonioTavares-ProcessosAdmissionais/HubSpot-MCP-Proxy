# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY server.js ./

# Expose port 880
EXPOSE 880

# Set environment variable for port
ENV PORT=880

# Start the application
CMD ["node", "server.js"]
