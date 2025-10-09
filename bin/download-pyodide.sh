#! /usr/bin/env bash

DEST_DIR="resources/frontend_client/app/assets"

REQUIRED_FILES=(
  "pyodide/pyodide-lock.json"
  "pyodide/pyodide.asm.js"
  "pyodide/pyodide.asm.wasm"
  "pyodide/pyodide.js"

  "pyodide/python_stdlib.zip"

  "pyodide/micropip-0.10.1-py3-none-any.whl"
  "pyodide/numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl"
  "pyodide/pandas-2.3.1-cp313-cp313-pyodide_2025_0_wasm32.whl"
  "pyodide/python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
  "pyodide/pytz-2025.2-py2.py3-none-any.whl"
  "pyodide/packaging-24.2-py3-none-any.whl"
  "pyodide/six-1.17.0-py2.py3-none-any.whl"
)

PYODIDE_VERSION="0.28.3"
DOWNLOAD_URL="https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}/pyodide-${PYODIDE_VERSION}.tar.bz2"

function all_files_exist() {
  for FILE in "${REQUIRED_FILES[@]}"; do
    TEST_FILE="$DEST_DIR/$FILE"

    if [ ! -f "$TEST_FILE" ]; then
      return 1
    fi
  done

  return 0
}

if all_files_exist; then
  echo "Pyodide files already exist, skipping download"
  exit 0
fi

echo "Downloading Pyodide $PYODIDE_VERSION into $DEST_DIR"
echo "This might take a while"

rm -rf "$DEST_DIR/pyodide"
mkdir -p "$DEST_DIR"

curl -Ls "$DOWNLOAD_URL" | tar xvf - -C "$DEST_DIR" ${REQUIRED_FILES[@]}
