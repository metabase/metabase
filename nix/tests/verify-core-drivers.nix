# nix/tests/verify-core-drivers.nix
#
# Test core-only image with mounted driver plugins.
# Usage: nix run .#verify-core-drivers
#
{ pkgs, lib }:

pkgs.writeShellApplication {
  name = "mb-verify-core-drivers";
  runtimeInputs = [
    pkgs.docker
    pkgs.curl
    pkgs.jq
    pkgs.coreutils
    pkgs.findutils
  ];
  text = ''
    echo "=== Metabase Core-Only Driver Verification ==="
    echo ""

    CONTAINER_CORE="mb-verify-core-$$"
    CONTAINER_DRIVER="mb-verify-driver-$$"
    MB_PORT_CORE=3480
    MB_PORT_DRIVER=3481

    cleanup() {
      echo "Cleaning up..."
      docker rm -f "$CONTAINER_CORE" 2>/dev/null || true
      docker rm -f "$CONTAINER_DRIVER" 2>/dev/null || true
    }
    trap cleanup EXIT

    # Build core OCI image and clickhouse driver
    echo "Building core OCI image..."
    IMAGE_STREAM=$(nix build .#oci-core-x86_64 --print-out-paths --no-link 2>/dev/null)
    if [ -z "$IMAGE_STREAM" ]; then
      echo "FAIL: Could not build core OCI image"
      exit 1
    fi

    echo "Building clickhouse driver..."
    DRIVER_PATH=$(nix build .#driver-clickhouse --print-out-paths --no-link 2>/dev/null)
    if [ -z "$DRIVER_PATH" ]; then
      echo "FAIL: Could not build clickhouse driver"
      exit 1
    fi

    echo "Loading core image..."
    IMAGE_ID=$("$IMAGE_STREAM" | docker load 2>/dev/null | grep -oP 'Loaded image: \K.*')
    echo "  Loaded: $IMAGE_ID"

    # Start container WITH mounted clickhouse driver
    echo ""
    echo "Starting container with clickhouse driver mounted..."
    DRIVER_JAR=$(find "$DRIVER_PATH" -name "*.jar" | head -1)
    docker run -d --name "$CONTAINER_DRIVER" \
      -p "$MB_PORT_DRIVER:3000" \
      -v "$DRIVER_JAR:/plugins/clickhouse.metabase-driver.jar" \
      "$IMAGE_ID"

    # Start container WITHOUT driver
    echo "Starting container without driver..."
    docker run -d --name "$CONTAINER_CORE" \
      -p "$MB_PORT_CORE:3000" \
      "$IMAGE_ID"

    # Wait for both containers to become healthy
    for port_info in "$MB_PORT_DRIVER:with-driver" "$MB_PORT_CORE:without-driver"; do
      PORT=''${port_info%%:*}
      LABEL=''${port_info##*:}
      echo "Waiting for $LABEL container (port $PORT)..."
      TIMEOUT=300
      WAITED=0
      while ! curl -sf "http://localhost:$PORT/api/health" 2>/dev/null | grep -q ok; do
        sleep 2
        WAITED=$((WAITED + 2))
        if [ "$WAITED" -ge "$TIMEOUT" ]; then
          echo "FAIL: $LABEL container did not become healthy after $TIMEOUT seconds"
          exit 1
        fi
      done
      echo "  $LABEL healthy after $WAITED seconds"
    done

    # Check driver availability
    echo ""
    echo "Checking driver availability..."

    DRIVERS_WITH=$(curl -sf "http://localhost:$MB_PORT_DRIVER/api/session/properties" \
      | jq -r '.engines | keys[]' 2>/dev/null || true)
    DRIVERS_WITHOUT=$(curl -sf "http://localhost:$MB_PORT_CORE/api/session/properties" \
      | jq -r '.engines | keys[]' 2>/dev/null || true)

    FAILED=0

    if echo "$DRIVERS_WITH" | grep -q "clickhouse"; then
      echo "  PASS: clickhouse available when driver mounted"
    else
      echo "  FAIL: clickhouse NOT available when driver mounted"
      FAILED=$((FAILED + 1))
    fi

    if echo "$DRIVERS_WITHOUT" | grep -q "clickhouse"; then
      echo "  FAIL: clickhouse should NOT be available without driver"
      FAILED=$((FAILED + 1))
    else
      echo "  PASS: clickhouse not available without driver (expected)"
    fi

    # Verify postgres is always available (built into core)
    if echo "$DRIVERS_WITH" | grep -q "postgres"; then
      echo "  PASS: postgres available (built into core)"
    else
      echo "  FAIL: postgres should always be available"
      FAILED=$((FAILED + 1))
    fi

    echo ""
    if [ "$FAILED" -eq 0 ]; then
      echo "=== All core-driver checks passed ==="
    else
      echo "=== $FAILED check(s) failed ==="
      exit 1
    fi
  '';
}
