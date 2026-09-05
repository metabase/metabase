# nix/microvms/lib.nix
#
# Reusable functions for generating Metabase MicroVM test scripts.
# Follows xdp2's lib.nix pattern adapted for Metabase lifecycle.
#
{
  pkgs,
  lib,
  constants,
}:

rec {
  # ==========================================================================
  # Core Helpers
  # ==========================================================================

  getArchConfig = arch: constants.architectures.${arch};
  getHostname = arch: constants.getHostname arch;
  getProcessName = arch: constants.getProcessName arch;

  # ==========================================================================
  # Polling Script Generator
  # ==========================================================================

  mkPollingScript =
    {
      name,
      arch,
      description,
      checkCmd,
      successMsg,
      failMsg,
      timeout,
      runtimeInputs ? [ pkgs.coreutils ],
      preCheck ? "",
      postSuccess ? "",
    }:
    pkgs.writeShellApplication {
      inherit name runtimeInputs;
      text = ''
        TIMEOUT=${toString timeout}
        POLL_INTERVAL=${toString constants.pollInterval}

        echo "=== ${description} ==="
        echo "Timeout: $TIMEOUT seconds (polling every $POLL_INTERVAL s)"
        echo ""

        ${preCheck}

        WAITED=0
        while ! ${checkCmd}; do
          sleep "$POLL_INTERVAL"
          WAITED=$((WAITED + POLL_INTERVAL))
          if [ "$WAITED" -ge "$TIMEOUT" ]; then
            echo "FAIL: ${failMsg} after $TIMEOUT seconds"
            exit 1
          fi
          echo "  Polling... ($WAITED/$TIMEOUT s)"
        done

        echo "PASS: ${successMsg}"
        echo "  Time: $WAITED seconds"
        ${postSuccess}
        exit 0
      '';
    };

  # ==========================================================================
  # Status Script
  # ==========================================================================

  mkStatusScript =
    { arch }:
    let
      cfg = getArchConfig arch;
      processName = getProcessName arch;
    in
    pkgs.writeShellApplication {
      name = "mb-vm-status-${arch}";
      runtimeInputs = [
        pkgs.curl
        pkgs.procps
        pkgs.coreutils
      ];
      text = ''
        echo "Metabase MicroVM Status (${arch})"
        echo "=================================="
        echo ""

        if pgrep -f "${processName}" > /dev/null 2>&1; then
          echo "VM Process: RUNNING"
          pgrep -af "${processName}" | head -1
        else
          echo "VM Process: NOT RUNNING"
        fi
        echo ""

        echo "Health Check:"
        if curl -sf ${constants.healthEndpoint} 2>/dev/null; then
          echo "  Metabase: HEALTHY"
        else
          echo "  Metabase: not responding"
        fi
      '';
    };

  # ==========================================================================
  # Lifecycle Phase Scripts
  # ==========================================================================

  mkLifecycleScripts =
    { arch }:
    let
      cfg = getArchConfig arch;
      hostname = getHostname arch;
      processName = getProcessName arch;
      timeouts = constants.getTimeouts arch;
    in
    {
      # Phase 0: Build
      checkBuild = pkgs.writeShellApplication {
        name = "mb-lifecycle-0-build-${arch}";
        runtimeInputs = [ pkgs.coreutils ];
        text = ''
          BUILD_TIMEOUT=${toString timeouts.build}

          echo "=== Lifecycle Phase 0: Build VM (${arch}) ==="
          echo "Timeout: $BUILD_TIMEOUT seconds"
          echo ""

          START_TIME=$(date +%s)

          if ! timeout "$BUILD_TIMEOUT" nix build .#microvm-test-${arch} --print-out-paths --no-link 2>&1; then
            END_TIME=$(date +%s)
            ELAPSED=$((END_TIME - START_TIME))
            echo "FAIL: Build failed or timed out after $ELAPSED seconds"
            exit 1
          fi

          END_TIME=$(date +%s)
          ELAPSED=$((END_TIME - START_TIME))
          echo "PASS: VM built in $ELAPSED seconds"
          exit 0
        '';
      };

      # Phase 1: Check process
      checkProcess = mkPollingScript {
        name = "mb-lifecycle-1-check-process-${arch}";
        inherit arch;
        description = "Lifecycle Phase 1: Check VM Process (${arch})";
        checkCmd = "pgrep -f '${processName}' > /dev/null 2>&1";
        successMsg = "VM process is running";
        failMsg = "VM process not found";
        timeout = timeouts.processStart;
        runtimeInputs = [
          pkgs.procps
          pkgs.coreutils
        ];
      };

      # Phase 2: Wait for VM boot
      checkBoot = mkPollingScript {
        name = "mb-lifecycle-2-check-boot-${arch}";
        inherit arch;
        description = "Lifecycle Phase 2: Wait for VM Boot (${arch})";
        checkCmd = "curl -sf http://localhost:${toString constants.metabasePort}/ > /dev/null 2>&1 || nc -z 127.0.0.1 ${toString constants.metabasePort} 2>/dev/null";
        successMsg = "VM booted and port available";
        failMsg = "VM not reachable";
        timeout = timeouts.vmBoot;
        runtimeInputs = [
          pkgs.curl
          pkgs.netcat-gnu
          pkgs.coreutils
        ];
      };

      # Phase 3: Wait for Metabase startup (health check)
      checkHealth = mkPollingScript {
        name = "mb-lifecycle-3-check-health-${arch}";
        inherit arch;
        description = "Lifecycle Phase 3: Wait for Metabase Health (${arch})";
        checkCmd = "curl -sf ${constants.healthEndpoint} 2>/dev/null | grep -q ok";
        successMsg = "Metabase is healthy";
        failMsg = "Metabase health check failed";
        timeout = timeouts.metabaseStart;
        runtimeInputs = [
          pkgs.curl
          pkgs.coreutils
        ];
      };

      # Phase 4: API smoke test
      checkApi = pkgs.writeShellApplication {
        name = "mb-lifecycle-4-check-api-${arch}";
        runtimeInputs = [
          pkgs.curl
          pkgs.jq
          pkgs.coreutils
        ];
        text = ''
          TIMEOUT=${toString timeouts.apiTest}

          echo "=== Lifecycle Phase 4: API Smoke Test (${arch}) ==="
          echo "Endpoint: ${constants.setupEndpoint}"
          echo ""

          RESPONSE=$(timeout "$TIMEOUT" curl -sf ${constants.setupEndpoint} 2>/dev/null || true)

          if [ -z "$RESPONSE" ]; then
            echo "FAIL: No response from API"
            exit 1
          fi

          VERSION=$(echo "$RESPONSE" | jq -r '.version.tag // empty' 2>/dev/null || true)
          if [ -n "$VERSION" ]; then
            echo "PASS: API responded with version $VERSION"
            exit 0
          else
            echo "FAIL: Could not extract version from response"
            echo "Response: $RESPONSE" | head -5
            exit 1
          fi
        '';
      };

      # Phase 5: Shutdown
      shutdown = pkgs.writeShellApplication {
        name = "mb-lifecycle-5-shutdown-${arch}";
        runtimeInputs = [
          pkgs.procps
          pkgs.coreutils
        ];
        text = ''
          echo "=== Lifecycle Phase 5: Shutdown VM (${arch}) ==="
          echo ""

          if pgrep -f "${processName}" > /dev/null 2>&1; then
            echo "Sending shutdown signal..."
            pkill -f "${processName}" 2>/dev/null || true
            echo "PASS: Shutdown signal sent"
          else
            echo "INFO: VM process not running"
          fi
          exit 0
        '';
      };

      # Phase 6: Wait for exit
      waitExit = mkPollingScript {
        name = "mb-lifecycle-6-wait-exit-${arch}";
        inherit arch;
        description = "Lifecycle Phase 6: Wait for Exit (${arch})";
        checkCmd = "! pgrep -f '${processName}' > /dev/null 2>&1";
        successMsg = "VM process exited";
        failMsg = "VM process still running";
        timeout = timeouts.shutdown;
        runtimeInputs = [
          pkgs.procps
          pkgs.coreutils
        ];
      };

      # Force kill
      forceKill = pkgs.writeShellApplication {
        name = "mb-lifecycle-force-kill-${arch}";
        runtimeInputs = [
          pkgs.procps
          pkgs.coreutils
        ];
        text = ''
          VM_PROCESS="${processName}"

          echo "=== Force Kill VM (${arch}) ==="
          echo ""

          if ! pgrep -f "$VM_PROCESS" > /dev/null 2>&1; then
            echo "No matching processes found"
            exit 0
          fi

          echo "Sending SIGTERM..."
          pkill -f "$VM_PROCESS" 2>/dev/null || true
          sleep 2

          if pgrep -f "$VM_PROCESS" > /dev/null 2>&1; then
            echo "Sending SIGKILL..."
            pkill -9 -f "$VM_PROCESS" 2>/dev/null || true
            sleep 1
          fi

          if pgrep -f "$VM_PROCESS" > /dev/null 2>&1; then
            echo "WARNING: Process may still be running"
            exit 1
          else
            echo "PASS: VM process killed"
            exit 0
          fi
        '';
      };

      # Full lifecycle test
      #
      # Runs the NixOS VM test (mkVm.nix) which boots a VM, starts Metabase,
      # and verifies health + API inside the VM.  If `nix build` succeeds,
      # all assertions passed.  No host-side curl is needed — the VM exits
      # after the test script completes.
      fullTest = pkgs.writeShellApplication {
        name = "mb-lifecycle-full-test-${arch}";
        runtimeInputs = [
          pkgs.coreutils
        ];
        text = ''
          # Colors
          GREEN='\033[0;32m'
          RED='\033[0;31m'
          NC='\033[0m'

          now_ms() { date +%s%3N; }

          echo "========================================"
          echo "  Metabase NixOS VM Lifecycle Test (${arch})"
          echo "========================================"
          echo ""
          echo "Running NixOS VM test (health check + API smoke inside VM)..."
          echo "Timeout: ${toString timeouts.build}s"
          echo ""

          START_MS=$(now_ms)

          # Run the NixOS VM test.  The test boots a full VM with PostgreSQL,
          # starts Metabase, and verifies: health, API version, DB migrations,
          # and built-in driver availability.
          if timeout ${toString timeouts.build} nix build .#microvm-test-${arch} --no-link 2>&1 \
             && OUT=$(nix build .#microvm-test-${arch} --print-out-paths --no-link 2>/dev/null); then
            END_MS=$(now_ms)
            ELAPSED_MS=$((END_MS - START_MS))
            echo ""

            # Surface application-layer test results from the VM log
            echo "--- Application-layer verification (inside VM) ---"
            nix log "$OUT" 2>/dev/null | grep -E '(PASS:|PERF:|All application|=== Query|=== Column|----)' || true
            echo "---"
            echo ""
            echo -e "  ''${GREEN}PASS: NixOS VM lifecycle test completed in ''${ELAPSED_MS}ms''${NC}"
          else
            END_MS=$(now_ms)
            ELAPSED_MS=$((END_MS - START_MS))
            echo ""
            echo -e "  ''${RED}FAIL: NixOS VM lifecycle test failed after ''${ELAPSED_MS}ms''${NC}"
            echo ""
            echo "--- Last 40 lines of VM log ---"
            FAIL_OUT=$(nix build .#microvm-test-${arch} --print-out-paths --no-link 2>/dev/null || true)
            if [ -n "$FAIL_OUT" ]; then
              nix log "$FAIL_OUT" 2>/dev/null | tail -40 || true
            fi
            exit 1
          fi
        '';
      };
    };
}
