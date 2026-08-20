FROM node:20-slim

# Install Python and system dependencies for yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ca-certificates \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp globally
RUN python3 -m pip install --break-system-packages --upgrade yt-dlp

# Set app directory
WORKDIR /usr/src/app

# Copy dependency configs and install npm packages
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]