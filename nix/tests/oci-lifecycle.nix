# nix/tests/oci-lifecycle.nix
#
# OCI container lifecycle test.
# Builds the OCI image, loads it, runs a container, verifies health.
#
{ pkgs, lib }:

let
  supportedArchs = [
    "x86_64"
    "aarch64"
    "riscv64"
  ];

  mkOciTest =
    arch:
    pkgs.writeShellApplication {
      name = "mb-test-oci-lifecycle-${arch}";
      runtimeInputs = [
        pkgs.docker
        pkgs.curl
        pkgs.jq
        pkgs.coreutils
      ];
      text = ''
        echo "=== Metabase OCI Lifecycle Test (${arch}) ==="
        echo ""

        CONTAINER_NAME="mb-oci-test-${arch}-$$"
        MB_PORT=3460

        cleanup() {
          echo "Cleaning up..."
          docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
        }
        trap cleanup EXIT

        # Build OCI image
        echo "Building OCI image for ${arch}..."
        IMAGE_STREAM=$(nix build .#oci-${arch} --print-out-paths --no-link 2>/dev/null)
        if [ -z "$IMAGE_STREAM" ]; then
          echo "FAIL: Could not build OCI image"
          exit 1
        fi

        # Load image
        echo "Loading image..."
        IMAGE_ID=$("$IMAGE_STREAM" | docker load 2>/dev/null | grep -oP 'Loaded image: \K.*')
        echo "  Loaded: $IMAGE_ID"

        # Run container
        echo "Starting container..."
        docker run -d --name "$CONTAINER_NAME" \
          -p "$MB_PORT:3000" \
          -e MB_DB_TYPE=h2 \
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

        echo "PASS: OCI container healthy after $WAITED seconds (${arch})"

        # API test
        VERSION=$(curl -sf "http://localhost:$MB_PORT/api/session/properties" | jq -r '.version.tag // empty' 2>/dev/null || true)
        if [ -n "$VERSION" ]; then
          echo "PASS: API version $VERSION"
        fi
      '';
    };

in
{
  tests = lib.genAttrs supportedArchs mkOciTest;
}
