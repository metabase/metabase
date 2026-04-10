#!/bin/bash
set -euo pipefail

# Default Metabase version
METABASE_VERSION="v1.60.0.x"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            METABASE_VERSION="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Build the universal Metabase benchmark base image."
            echo ""
            echo "Options:"
            echo "  --version VERSION    Metabase version to download (default: ${METABASE_VERSION})"
            echo "  -h, --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  # Build with default version"
            echo "  $0"
            echo ""
            echo "  # Build with specific version"
            echo "  $0 --version v1.58.0"
            exit 0
            ;;
        *)
            echo "Error: Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "======================================"
echo "Building Universal Metabase Benchmark Image"
echo "======================================"
echo ""
echo "This creates a universal image with Postgres + Metabase (no data)."
echo "Data will be loaded at runtime from suite-specific dumps."
echo ""

# Get the script directory and navigate to docker directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(cd "${SCRIPT_DIR}/../docker" && pwd)"

cd "${DOCKER_DIR}"

echo "Will download Metabase ${METABASE_VERSION} during build"
echo ""

# Build the image
echo "Building Docker image..."
docker build --build-arg METABASE_VERSION="${METABASE_VERSION}" -t metabase-benchmark-base:latest .

echo ""
echo "======================================"
echo "✓ Build Complete!"
echo "======================================"
echo ""
echo "Image created: metabase-benchmark-base:latest"
echo "Using Metabase version: ${METABASE_VERSION}"
echo ""
echo "Next steps:"
echo "  # Start Metabase with a benchmark suite's data"
echo "  ${SCRIPT_DIR}/start-metabase.sh canonical_benchmark"
echo ""
echo "  # Then run benchmarks:"
echo "  poetry run python -m src.benchmarks.e2e"
echo ""
