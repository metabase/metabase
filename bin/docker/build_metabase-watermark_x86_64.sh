set -e
docker buildx build --platform linux/amd64 -f Dockerfile -t xiahaohai123/metabase-watermark-x86_64:latest .
