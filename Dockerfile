# Use Node.js LTS version
FROM node:18-slim

# Install ffmpeg and other dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Create a non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Make the Rhubarb binary executable
RUN chmod +x bin/rhubarb/rhubarb && \
    chown nodejs:nodejs bin/rhubarb/rhubarb

# Create directory for audio files and set permissions
RUN mkdir -p audios && \
    chown -R nodejs:nodejs /usr/src/app

# Create a template .env file
RUN echo "OPENAI_API_KEY=\nELEVEN_LABS_API_KEY=\nELEVEN_LABS_VOICE_ID=" > .env.template

# Switch to non-root user
USER nodejs

# Expose the port the app runs on
EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Command to run the application
CMD ["node", "index.js"]