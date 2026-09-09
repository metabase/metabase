# nix/microvms/default.nix
#
# Entry point for Metabase MicroVM test infrastructure.
# Generates VMs and helper scripts for all supported architectures.
#
# Following xdp2's pattern: supportedArchs + lib.genAttrs for zero-duplication.
#
{
  pkgs,
  lib,
  metabase,
  nixpkgs,
  clickhouseDriver ? null,
  buildSystem ? "x86_64-linux",
}:

let
  constants = import ./constants.nix;
  microvmLib = import ./lib.nix { inherit pkgs lib constants; };

  supportedArchs = [
    "x86_64"
    "aarch64"
    "riscv64"
  ];

  # ==========================================================================
  # Generate VMs for all architectures
  # ==========================================================================

  vms = lib.genAttrs supportedArchs (
    arch:
    import ./mkVm.nix {
      inherit
        pkgs
        lib
        metabase
        nixpkgs
        arch
        buildSystem
        clickhouseDriver
        ;
    }
  );

  # ==========================================================================
  # Generate lifecycle scripts for all architectures
  # ==========================================================================

  lifecycleByArch = lib.genAttrs supportedArchs (
    arch: microvmLib.mkLifecycleScripts { inherit arch; }
  );

  # ==========================================================================
  # Generate helper scripts for all architectures
  # ==========================================================================

  helpersByArch = lib.genAttrs supportedArchs (arch: {
    status = microvmLib.mkStatusScript { inherit arch; };
  });

  # ==========================================================================
  # Test runners
  # ==========================================================================

  testsByArch = lib.genAttrs supportedArchs (
    arch:
    pkgs.writeShellApplication {
      name = "mb-test-${arch}";
      runtimeInputs = [ pkgs.coreutils ];
      text = ''
        echo "========================================"
        echo "  Metabase MicroVM Test: ${arch}"
        echo "========================================"
        echo ""
        ${lifecycleByArch.${arch}.fullTest}/bin/mb-lifecycle-full-test-${arch}
      '';
    }
  );

  testAll = pkgs.writeShellApplication {
    name = "mb-test-all-architectures";
    runtimeInputs = [ pkgs.coreutils ];
    text = ''
      echo "========================================"
      echo "  Metabase MicroVM Test: ALL ARCHITECTURES"
      echo "========================================"
      echo ""
      echo "Architectures: ${lib.concatStringsSep ", " supportedArchs}"
      echo ""

      FAILED=""
      PASSED=""

      for arch in ${lib.concatStringsSep " " supportedArchs}; do
        echo ""
        echo "════════════════════════════════════════"
        echo "  Testing: $arch"
        echo "════════════════════════════════════════"

        TEST_SCRIPT=""
        case "$arch" in
          x86_64)  TEST_SCRIPT="${lifecycleByArch.x86_64.fullTest}/bin/mb-lifecycle-full-test-x86_64" ;;
          aarch64) TEST_SCRIPT="${lifecycleByArch.aarch64.fullTest}/bin/mb-lifecycle-full-test-aarch64" ;;
          riscv64) TEST_SCRIPT="${lifecycleByArch.riscv64.fullTest}/bin/mb-lifecycle-full-test-riscv64" ;;
        esac

        if $TEST_SCRIPT; then
          PASSED="$PASSED $arch"
          echo "  Result: PASS"
        else
          FAILED="$FAILED $arch"
          echo "  Result: FAIL"
        fi
      done

      echo ""
      echo "========================================"
      echo "  Summary"
      echo "========================================"
      if [ -n "$PASSED" ]; then
        echo "  PASSED:$PASSED"
      fi
      if [ -n "$FAILED" ]; then
        echo "  FAILED:$FAILED"
        exit 1
      else
        echo ""
        echo "  All architectures passed!"
        exit 0
      fi
    '';
  };

  # ==========================================================================
  # Flat package exports for flake.nix
  # ==========================================================================

  flatPackages =
    let
      mkArchPackages =
        arch:
        let
          lc = lifecycleByArch.${arch};
          hp = helpersByArch.${arch};
        in
        {
          "mb-lifecycle-0-build-${arch}" = lc.checkBuild;
          "mb-lifecycle-1-check-process-${arch}" = lc.checkProcess;
          "mb-lifecycle-2-check-boot-${arch}" = lc.checkBoot;
          "mb-lifecycle-3-check-health-${arch}" = lc.checkHealth;
          "mb-lifecycle-4-check-api-${arch}" = lc.checkApi;
          "mb-lifecycle-5-shutdown-${arch}" = lc.shutdown;
          "mb-lifecycle-6-wait-exit-${arch}" = lc.waitExit;
          "mb-lifecycle-force-kill-${arch}" = lc.forceKill;
          "mb-lifecycle-full-test-${arch}" = lc.fullTest;
          "mb-vm-status-${arch}" = hp.status;
          "mb-test-${arch}" = testsByArch.${arch};
        };
    in
    lib.foldl' (acc: arch: acc // mkArchPackages arch) { } supportedArchs;

in
{
  inherit vms lifecycleByArch;
  helpers = helpersByArch;
  tests = testsByArch // {
    all = testAll;
  };
  inherit testsByArch testAll;
  inherit constants supportedArchs;

  # Flat package exports
  packages = flatPackages;
}
