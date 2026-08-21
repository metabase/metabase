# nix/tests/verify-oci-sizes.nix
#
# Build all OCI variants and compare sizes.
# Usage: nix run .#verify-oci-sizes
#
{ pkgs, lib }:

pkgs.writeShellApplication {
  name = "mb-verify-oci-sizes";
  runtimeInputs = [ pkgs.coreutils ];
  text = ''
    echo "=== Metabase OCI Image Size Comparison ==="
    echo ""

    FULL_SIZE=0
    MINIMAL_SIZE=0
    CORE_SIZE=0

    echo "Building oci-x86_64 (full)..."
    FULL_PATH=$(nix build .#oci-x86_64 --print-out-paths --no-link 2>/dev/null)
    if [ -n "$FULL_PATH" ]; then
      FULL_SIZE=$(nix path-info -S "$FULL_PATH" 2>/dev/null | awk '{print $2}')
      echo "  Size: $((FULL_SIZE / 1024 / 1024)) MB"
    else
      echo "  SKIP: build failed"
    fi

    echo "Building oci-minimal-x86_64 (no CJK fonts)..."
    MINIMAL_PATH=$(nix build .#oci-minimal-x86_64 --print-out-paths --no-link 2>/dev/null)
    if [ -n "$MINIMAL_PATH" ]; then
      MINIMAL_SIZE=$(nix path-info -S "$MINIMAL_PATH" 2>/dev/null | awk '{print $2}')
      echo "  Size: $((MINIMAL_SIZE / 1024 / 1024)) MB"
    else
      echo "  SKIP: build failed"
    fi

    echo "Building oci-core-x86_64 (no bundled external drivers)..."
    CORE_PATH=$(nix build .#oci-core-x86_64 --print-out-paths --no-link 2>/dev/null)
    if [ -n "$CORE_PATH" ]; then
      CORE_SIZE=$(nix path-info -S "$CORE_PATH" 2>/dev/null | awk '{print $2}')
      echo "  Size: $((CORE_SIZE / 1024 / 1024)) MB"
    else
      echo "  SKIP: build failed"
    fi

    echo ""
    echo "=== Summary ==="
    printf "  %-30s %s\n" "Variant" "Size"
    printf "  %-30s %s\n" "------------------------------" "----------"
    if [ "$FULL_SIZE" -gt 0 ]; then
      printf "  %-30s %s MB\n" "oci-x86_64 (full)" "$((FULL_SIZE / 1024 / 1024))"
    fi
    if [ "$MINIMAL_SIZE" -gt 0 ]; then
      printf "  %-30s %s MB\n" "oci-minimal-x86_64 (no CJK)" "$((MINIMAL_SIZE / 1024 / 1024))"
    fi
    if [ "$CORE_SIZE" -gt 0 ]; then
      printf "  %-30s %s MB\n" "oci-core-x86_64 (core-only)" "$((CORE_SIZE / 1024 / 1024))"
    fi

    # Verify ordering
    FAILED=0
    echo ""
    if [ "$FULL_SIZE" -gt 0 ] && [ "$MINIMAL_SIZE" -gt 0 ]; then
      if [ "$MINIMAL_SIZE" -lt "$FULL_SIZE" ]; then
        echo "  PASS: minimal < full (CJK fonts removed)"
      else
        echo "  FAIL: minimal should be smaller than full"
        FAILED=$((FAILED + 1))
      fi
    fi
    if [ "$FULL_SIZE" -gt 0 ] && [ "$CORE_SIZE" -gt 0 ]; then
      if [ "$CORE_SIZE" -lt "$FULL_SIZE" ]; then
        echo "  PASS: core < full (drivers removed)"
      else
        echo "  FAIL: core should be smaller than full"
        FAILED=$((FAILED + 1))
      fi
    fi

    if [ "$FAILED" -gt 0 ]; then
      exit 1
    fi
  '';
}
