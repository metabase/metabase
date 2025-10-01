#!/bin/bash

# Download complete Pyodide distribution with packages
# This script downloads the full pyodide distribution including all packages

PYODIDE_VERSION="0.26.4"
PYODIDE_DIR="node_modules/pyodide"
DOWNLOAD_URL="https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full"

echo "Downloading complete Pyodide v${PYODIDE_VERSION} distribution..."

# Create directory if it doesn't exist
mkdir -p "${PYODIDE_DIR}"

# Download essential files
echo "Downloading core files..."
wget -q -P "${PYODIDE_DIR}" "${DOWNLOAD_URL}/pyodide.js" || curl -s -o "${PYODIDE_DIR}/pyodide.js" "${DOWNLOAD_URL}/pyodide.js"
wget -q -P "${PYODIDE_DIR}" "${DOWNLOAD_URL}/pyodide.asm.js" || curl -s -o "${PYODIDE_DIR}/pyodide.asm.js" "${DOWNLOAD_URL}/pyodide.asm.js"
wget -q -P "${PYODIDE_DIR}" "${DOWNLOAD_URL}/pyodide.asm.wasm" || curl -s -o "${PYODIDE_DIR}/pyodide.asm.wasm" "${DOWNLOAD_URL}/pyodide.asm.wasm"
wget -q -P "${PYODIDE_DIR}" "${DOWNLOAD_URL}/python_stdlib.zip" || curl -s -o "${PYODIDE_DIR}/python_stdlib.zip" "${DOWNLOAD_URL}/python_stdlib.zip"
wget -q -P "${PYODIDE_DIR}" "${DOWNLOAD_URL}/pyodide-lock.json" || curl -s -o "${PYODIDE_DIR}/pyodide-lock.json" "${DOWNLOAD_URL}/pyodide-lock.json"

# Download essential packages
echo "Downloading essential packages..."
for package in pandas numpy micropip; do
  echo "  - ${package}..."
  # Get package filename from lock file
  if [ -f "${PYODIDE_DIR}/pyodide-lock.json" ]; then
    filename=$(grep -A 5 "\"${package}\":" "${PYODIDE_DIR}/pyodide-lock.json" | grep '"file_name"' | cut -d'"' -f4)
    if [ -n "$filename" ]; then
      wget -q -P "${PYODIDE_DIR}" "${DOWNLOAD_URL}/${filename}" || curl -s -o "${PYODIDE_DIR}/${filename}" "${DOWNLOAD_URL}/${filename}"
    fi
  fi
done

echo "Pyodide download completed!"
echo "Files available in ${PYODIDE_DIR}:"
ls -la "${PYODIDE_DIR}"