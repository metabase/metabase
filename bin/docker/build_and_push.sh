set -e
docker buildx build --platform linux/arm64,linux/amd64 -t xiahaohai123/metabase-watermark:latest --push .
