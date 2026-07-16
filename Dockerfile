FROM node:20-slim

RUN apt-get update && apt-get install -y \
    xvfb x11-utils libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libwayland-client0 \
    && rm -rf /var/lib/apt/lists/*

ENV DISPLAY=:99
ENV SCREEN_SIZE=1920x1080x24

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

RUN npx patchright install chrome

COPY . .
RUN npm run build

RUN mkdir -p profiles

EXPOSE 8000

CMD ["./start.sh"]
