#!/bin/bash

# Create output directory if it doesn't exist
mkdir -p output

# Run Python script in sandboxed environment
docker run --network none \
  --read-only \
  --tmpfs /tmp:uid=1000,gid=1000 \
  -v $(pwd)/user_script.py:/sandbox/script.py:ro \
  -v $(pwd)/output:/sandbox/output \
  -e OUTPUT_FILE=/sandbox/output/result.csv \
  -e TIMEOUT=30 \
  --security-opt=no-new-privileges:true \
  --memory=512m --cpus=0.5 \
  python-sandbox