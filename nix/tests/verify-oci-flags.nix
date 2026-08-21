# nix/tests/verify-oci-flags.nix
#
# Verify JVM flags (ZGC, container support, etc.) in running OCI container.
# Usage: nix run .#verify-oci-flags
#
{ pkgs, lib }:

pkgs.writeShellApplication {
  name = "mb-verify-oci-flags";
  runtimeInputs = [
    pkgs.docker
    pkgs.curl
    pkgs.jq
    pkgs.coreutils
  ];
  text = ''
    echo "=== Metabase OCI JVM Flag Verification ==="
    echo ""

    CONTAINER_NAME="mb-verify-flags-$$"
    MB_PORT=3470

    cleanup() {
      echo "Cleaning up..."
      docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
      docker rm -f "''${CONTAINER_NAME}-opts" 2>/dev/null || true
    }
    trap cleanup EXIT

    # Build and load OCI image
    echo "Building OCI image..."
    IMAGE_STREAM=$(nix build .#oci-x86_64 --print-out-paths --no-link 2>/dev/null)
    if [ -z "$IMAGE_STREAM" ]; then
      echo "FAIL: Could not build OCI image"
      exit 1
    fi

    echo "Loading image..."
    IMAGE_ID=$("$IMAGE_STREAM" | docker load 2>/dev/null | grep -oP 'Loaded image: \K.*')
    echo "  Loaded: $IMAGE_ID"

    # Start container
    echo "Starting container..."
    docker run -d --name "$CONTAINER_NAME" \
      -p "$MB_PORT:3000" \
      "$IMAGE_ID"

    # Wait for health
    echo "Waiting for health..."
    TIMEOUT=300
    WAITED=0
    while ! curl -sf "http://localhost:$MB_PORT/api/health" 2>/dev/null | grep -q ok; do
      sleep 2
      WAITED=$((WAITED + 2))
      if [ "$WAITED" -ge "$TIMEOUT" ]; then
        echo "FAIL: Container did not become healthy after $TIMEOUT seconds"
        docker logs "$CONTAINER_NAME" 2>&1 | tail -20
        exit 1
      fi
    done
    echo "  Healthy after $WAITED seconds"

    # Verify JVM flags via /proc/1/cmdline
    echo ""
    echo "Verifying JVM flags..."
    CMDLINE=$(docker exec "$CONTAINER_NAME" cat /proc/1/cmdline | tr '\0' ' ')
    echo "  JVM command line: $CMDLINE"

    FAILED=0
    for flag in "UseZGC" "CrashOnOutOfMemoryError" "UseContainerSupport" "MaxRAMPercentage"; do
      if echo "$CMDLINE" | grep -q "$flag"; then
        echo "  PASS: $flag present"
      else
        echo "  FAIL: $flag missing"
        FAILED=$((FAILED + 1))
      fi
    done

    # Stop first container
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

    # Test JAVA_OPTS extension
    echo ""
    echo "Verifying JAVA_OPTS extension..."
    docker run -d --name "''${CONTAINER_NAME}-opts" \
      -p "$MB_PORT:3000" \
      -e JAVA_OPTS="-Dtest.verify.flag=hello" \
      "$IMAGE_ID"

    sleep 5
    CMDLINE_OPTS=$(docker exec "''${CONTAINER_NAME}-opts" cat /proc/1/cmdline | tr '\0' ' ')
    if echo "$CMDLINE_OPTS" | grep -q "test.verify.flag=hello"; then
      echo "  PASS: JAVA_OPTS extension works"
    else
      echo "  FAIL: JAVA_OPTS extension not working"
      FAILED=$((FAILED + 1))
    fi

    echo ""
    if [ "$FAILED" -eq 0 ]; then
      echo "=== All JVM flag checks passed ==="
    else
      echo "=== $FAILED check(s) failed ==="
      exit 1
    fi
  '';
}
