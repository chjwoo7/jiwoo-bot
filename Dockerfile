FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# .env will be mounted via docker-compose volumes
# No need to copy here, it's handled by volume mount

CMD ["node", "index.js"]
