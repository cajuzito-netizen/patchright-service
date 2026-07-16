#!/bin/bash
set -e

Xvfb ${DISPLAY:-:99} -screen 0 ${SCREEN_SIZE:-1920x1080x24} +extension GLX &
sleep 2

exec node dist/index.js
