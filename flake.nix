# Metabase Nix Flake
#
# Quick start:
#   nix develop                       - Dev shell (Java 21, Node 22, Bun, Clojure, PostgreSQL 18)
#   nix build                         - Build metabase.jar from source
#   nix build .#oci-x86_64            - Build OCI container (x86_64, full)
#   nix build .#oci-minimal-x86_64   - Build OCI container (x86_64, no CJK fonts)
#   nix build .#oci-core-x86_64      - Build OCI container (x86_64, core-only)
#   nix build .#oci-clickhouse-x86_64 - Build OCI container (x86_64, core + clickhouse)
#   nix build .#oci-aarch64           - Build OCI container (ARM64)
#   nix build .#oci-riscv64           - Build OCI container (RISC-V 64)
#   nix build .#tests-all             - Run all integration tests
#   nix build .#microvm-test-x86_64   - Run NixOS VM lifecycle test (x86_64)
#   nix build .#microvm-test-aarch64  - Run NixOS VM lifecycle test (ARM64)
#   nix run .#check-reproducibility          - Verify bit-for-bit reproducibility
#   nix run .#mb-lifecycle-full-test-x86_64  - Full lifecycle test with timing
#
# Sub-derivations (for targeted rebuilds):
#   nix build .#frontend              - Frontend assets only
#   nix build .#static-viz            - Static visualization bundle only
#   nix build .#translations          - i18n artifacts only
#   nix build .#drivers               - Database drivers only
#   nix build .#metabase-core         - Core-only (no bundled external drivers)
#   nix build .#uberjar-core          - Core-only uberjar
#
# Debugging:
#   MB_NIX_DEBUG=1 nix develop        - Debug mode with verbose env output
#
{
  description = "Metabase - Business Intelligence and Embedded Analytics";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    # For local development with a pinned nixpkgs checkout:
    # nixpkgs.url = "path:/path/to/your/nixpkgs";

    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        lib = nixpkgs.lib;

        # Version from git or fallback
        version = "0.0.0-nix";

        # Import packages module
        packagesModule = import ./nix/packages.nix { inherit pkgs; };

        # Import environment variables
        envVars = import ./nix/env-vars.nix {
          inherit pkgs;
          packages = packagesModule;
        };

        # Filter source to exclude Nix files, .git, flake inputs
        # Editing .nix files won't invalidate sub-derivation caches
        filteredSrc = lib.cleanSourceWith {
          src = ./.;
          filter =
            path: type:
            let
              relPath = lib.removePrefix (toString ./.) path;
            in
            !(lib.hasPrefix "/nix" relPath)
            && !(lib.hasPrefix "/flake" relPath)
            && !(lib.hasPrefix "/.git" relPath)
            && !(lib.hasSuffix ".nix" relPath);
        };

        # Import derivation orchestrator
        derivation = import ./nix/derivation {
          inherit pkgs lib version;
          jre = packagesModule.jre;
          src = filteredSrc;
          edition = "oss";
        };

        # The final Metabase package
        metabase = derivation.metabase;

        # Import development shell
        devshell = import ./nix/devshell.nix {
          inherit pkgs lib envVars;
          packages = packagesModule;
        };

        # Import OCI container images
        oci = import ./nix/oci {
          inherit
            pkgs
            lib
            metabase
            version
            ;
          metabaseCore = derivation.metabaseCore;
          drivers = derivation.drivers;
          jre = packagesModule.jre;
        };

        # Import static analysis
        staticAnalysis = import ./nix/static-analysis {
          inherit pkgs lib;
          uberjar = derivation.uberjar;
          src = filteredSrc;
        };

        # Import security checks
        security = import ./nix/security {
          inherit pkgs lib;
          src = filteredSrc;
        };

        # Import tests
        tests = import ./nix/tests {
          inherit pkgs lib metabase;
        };

        # Import MicroVM infrastructure
        microvms = import ./nix/microvms {
          inherit
            pkgs
            lib
            metabase
            nixpkgs
            ;
          clickhouseDriver = derivation.drivers.clickhouse;
          buildSystem = system;
        };

        # ── Performance benchmark variants ──────────────────────────────
        # Each variant is a Metabase build with a different patch applied.
        # Only the uberjar stage rebuilds — all other sub-derivations are cached.

        # "vanilla" = current working tree (includes MB_LUDICROUS_SPEED=true setting)
        # The patches below represent alternative approaches:

        variantSkipAll = derivation.mkVariant {
          pname = "metabase-no-insights";
          patchFile = ./nix/patches/skip-insights-all.patch;
          description = "Metabase with insights-xform unconditionally disabled";
        };

        variantSkipDashboard = derivation.mkVariant {
          pname = "metabase-skip-dash-insights";
          patchFile = ./nix/patches/skip-insights-dashboard.patch;
          description = "Metabase with insights skipped for dashboard card queries";
        };

        # Benchmark VM: runs all variants side-by-side
        benchVm = import ./nix/microvms/mkBenchVm.nix {
          inherit
            pkgs
            lib
            nixpkgs
            ;
          arch = "x86_64";
          clickhouseDriver = derivation.drivers.clickhouse;
          buildSystem = system;
          variants = [
            # Order matters — first is the baseline (bears warmup cost)
            {
              name = "vanilla";
              package = metabase;
            }
            {
              name = "no-insights";
              package = variantSkipAll;
            }
            {
              name = "skip-dash";
              package = variantSkipDashboard;
            }
          ];
        };

      in
      {
        # ===================================================================
        # Packages
        # ===================================================================

        packages = {
          # Primary outputs
          default = metabase;
          metabase = metabase;

          # Sub-derivations (for targeted rebuilds)
          frontend = derivation.frontend;
          static-viz = derivation.staticViz;
          translations = derivation.translations;
          drivers = derivation.drivers.all;
          uberjar = derivation.uberjar;
          deps-clojure = derivation.clojureDeps;
          deps-frontend = derivation.frontendDeps;

          # Core-only variants (no bundled external drivers)
          metabase-core = derivation.metabaseCore;
          uberjar-core = derivation.uberjarCore;

          # Individual driver derivations (nix build .#driver-clickhouse, etc.)
        }
        // (lib.mapAttrs' (name: drv: lib.nameValuePair "driver-${name}" drv) (
          removeAttrs derivation.drivers [ "all" ]
        ))
        // {

          # Static analysis
          check-spotbugs = staticAnalysis.spotbugs;
          check-nvd = staticAnalysis.nvdClojure;
          check-kibit = staticAnalysis.kibit;
          check-kondo = staticAnalysis.kondo;
          check-eastwood = staticAnalysis.eastwood;
          check-all-static = staticAnalysis.all;

          # Security
          check-ddl-audit = security.ddlAudit;
          check-security-all = security.all;

          # Tests
          tests-health-check = tests.health-check;
          tests-api-smoke = tests.api-smoke;
          tests-db-migration = tests.db-migration;
          tests-clickhouse-backend = tests.clickhouse-backend;
          tests-all = tests.all;

          # OCI lifecycle tests (per-arch)
          tests-oci-x86_64 = tests.oci-lifecycle.x86_64;
          tests-oci-aarch64 = tests.oci-lifecycle.aarch64;
          tests-oci-riscv64 = tests.oci-lifecycle.riscv64;

          # MicroVM tests
          microvm-test-x86_64 = microvms.vms.x86_64;
          microvm-test-aarch64 = microvms.vms.aarch64;
          microvm-test-riscv64 = microvms.vms.riscv64;

          # MicroVM test runners
          mb-test-all = microvms.testAll;

          # Performance benchmark variants
          metabase-no-insights = variantSkipAll;
          metabase-skip-dash-insights = variantSkipDashboard;

          # Multi-variant benchmark VM (builds all variants, benchmarks side-by-side)
          bench-variants-x86_64 = benchVm;

          # Convenience: format all Nix files
          fmt = pkgs.writeShellApplication {
            name = "mb-nix-fmt";
            runtimeInputs = [ pkgs.nixfmt ];
            text = ''
              nixfmt nix/ flake.nix
            '';
          };

          # Verify bit-for-bit reproducibility of Clojure-compiled derivations
          check-reproducibility = pkgs.writeShellApplication {
            name = "mb-check-reproducibility";
            runtimeInputs = [ pkgs.diffoscope ];
            text = ''
              set -euo pipefail

              default_targets=("translations" "uberjar" "uberjar-core" "drivers")
              all_targets=("translations" "uberjar" "uberjar-core" "drivers" "frontend" "static-viz" "metabase" "metabase-core")

              targets=("''${default_targets[@]}")
              ROUNDS=1

              while [[ $# -gt 0 ]]; do
                case "$1" in
                  --all) targets=("''${all_targets[@]}"); shift ;;
                  --rounds) ROUNDS="$2"; shift 2 ;;
                  *) shift ;;
                esac
              done

              passed=0
              failed=0
              failures=()

              echo "=== Metabase Nix Reproducibility Check ==="
              echo "Rounds per target: $ROUNDS"
              echo ""

              for target in "''${targets[@]}"; do
                echo "--- Checking .#$target ---"
                echo "  Building (first pass)..."
                if ! nix build ".#$target" 2>&1; then
                  echo "  SKIP: $target failed to build"
                  failed=$((failed + 1))
                  failures+=("$target (build failed)")
                  echo ""
                  continue
                fi
                target_ok=true
                for round in $(seq 1 "$ROUNDS"); do
                  echo "  Rebuild round $round/$ROUNDS..."
                  if ! nix build ".#$target" --rebuild 2>&1; then
                    echo "  FAIL: $target is NOT reproducible (round $round)"
                    echo "  Run 'diffoscope' on the two outputs for details."
                    failed=$((failed + 1))
                    failures+=("$target (round $round)")
                    target_ok=false
                    break
                  fi
                done
                if $target_ok; then
                  echo "  PASS: $target is reproducible ($ROUNDS round(s))"
                  passed=$((passed + 1))
                fi
                echo ""
              done

              echo "=== Summary ==="
              echo "  Passed: $passed"
              echo "  Failed: $failed"
              if [[ $failed -gt 0 ]]; then
                echo "  Failed targets: ''${failures[*]}"
                exit 1
              else
                echo "  All targets are bit-for-bit reproducible!"
              fi
            '';
          };

          # Verification scripts
          verify-oci-flags = import ./nix/tests/verify-oci-flags.nix { inherit pkgs lib; };
          verify-oci-sizes = import ./nix/tests/verify-oci-sizes.nix { inherit pkgs lib; };
          verify-core-drivers = import ./nix/tests/verify-core-drivers.nix { inherit pkgs lib; };

        }
        // oci
        // microvms.packages; # Flatten OCI + lifecycle scripts into packages

        # ===================================================================
        # Development Shell
        # ===================================================================

        devShells.default = devshell;

        # ===================================================================
        # Checks (for `nix flake check`)
        # ===================================================================

        checks = {
          # Fast checks
          formatting =
            pkgs.runCommand "check-nix-format"
              {
                nativeBuildInputs = [ pkgs.nixfmt ];
              }
              ''
                nixfmt --check ${./nix} ${./flake.nix}
                touch $out
              '';

          build-smoke = pkgs.runCommand "mb-test-build-smoke" { } ''
            test -f ${metabase}/bin/metabase
            test -f ${metabase}/share/metabase/metabase.jar
            test -f ${derivation.metabaseCore}/bin/metabase
            test -f ${derivation.metabaseCore}/share/metabase/metabase.jar
            touch $out
          '';

          oci-builds = pkgs.runCommand "check-oci-builds" { } ''
            test -f ${oci.oci-x86_64}
            test -f ${oci.oci-minimal-x86_64}
            test -f ${oci.oci-core-x86_64}
            touch $out
          '';

          # Integration tests (slower — require PostgreSQL/Docker)
          health-check = tests.health-check;
          api-smoke = tests.api-smoke;
          db-migration = tests.db-migration;
        };

        # ===================================================================
        # Formatter (for `nix fmt`)
        # ===================================================================

        formatter = pkgs.nixfmt;
      }
    );
}
