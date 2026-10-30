#!/bin/bash
set -e
cd "$(dirname "$0")"
unset XAI_API_KEY OPENAI_API_KEY
./runtime/grok login
printf '\nGrok login finished. Return to Codex.\n'
read -r -p 'Press Enter to close.'
