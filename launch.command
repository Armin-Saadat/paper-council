#!/bin/bash
set -e
cd "$(dirname "$0")"
exec ./runtime/node-v22.23.4-darwin-arm64/bin/node ./server.mjs
