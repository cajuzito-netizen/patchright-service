#!/bin/bash
set -e

echo "=== Patchright Service Setup ==="

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo "pnpm not found. Installing..."
    npm install -g pnpm
fi

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Install system dependencies (Ubuntu/Debian)
if command -v apt-get &> /dev/null; then
    echo "Installing system dependencies..."
    sudo apt-get update
    sudo apt-get install -y \
        xvfb \
        libnss3 \
        libnspr4 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libdbus-1-3 \
        libxkbcommon0 \
        libatspi2.0-0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libpango-1.0-0 \
        libcairo2 \
        libasound2t64 \
        libwayland-client0
fi

# Install Chrome
echo "Installing Chrome browser..."
pnpm run install-browsers

# Build
echo "Building TypeScript..."
pnpm run build

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start the server with: PORT=8080 pnpm start"
echo ""
