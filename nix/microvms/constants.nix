# nix/microvms/constants.nix
#
# Configuration constants for Metabase MicroVM test infrastructure.
# Follows the xdp2 pattern with Metabase-specific timeouts.
#
rec {
  # ==========================================================================
  # Port allocation scheme
  # ==========================================================================
  #
  # Base port: 23600 (different from xdp2's 23500 to avoid conflicts)
  # Each architecture gets a block of 10 ports:
  #   x86_64:  23600-23609
  #   aarch64: 23610-23619
  #   riscv64: 23620-23629
  #
  # Within each block:
  #   +0 = Metabase HTTP (30000 forwarded)
  #   +1 = reserved
  #
  portBase = 23600;

  archPortOffset = {
    x86_64 = 0;
    aarch64 = 10;
    riscv64 = 20;
  };

  getPorts =
    arch:
    let
      base = portBase + archPortOffset.${arch};
    in
    {
      http = base; # Metabase HTTP port forward
    };

  # ==========================================================================
  # Architecture Definitions
  # ==========================================================================

  architectures = {
    x86_64 = {
      nixSystem = "x86_64-linux";
      useKvm = true;
      consoleDevice = "ttyS0";
      mem = 2048; # Metabase needs more RAM than typical services
      vcpu = 2;
      description = "x86_64 (KVM accelerated)";
    };

    aarch64 = {
      nixSystem = "aarch64-linux";
      useKvm = false;
      consoleDevice = "ttyAMA0";
      mem = 2048;
      vcpu = 2;
      description = "aarch64 (ARM64, QEMU emulated)";
    };

    riscv64 = {
      nixSystem = "riscv64-linux";
      useKvm = false;
      consoleDevice = "ttyS0";
      mem = 2048;
      vcpu = 2;
      description = "riscv64 (RISC-V 64-bit, QEMU emulated)";
    };
  };

  # ==========================================================================
  # Lifecycle timing configuration
  # ==========================================================================
  #
  # Metabase has longer startup times than typical services due to:
  #   - JVM startup overhead
  #   - Database migrations on first boot
  #   - Frontend asset loading
  #

  pollInterval = 1;

  # KVM timeouts (x86_64 — fast)
  timeouts = {
    build = 1200;
    processStart = 5;
    vmBoot = 60;
    metabaseStart = 300; # First boot runs DB migrations
    healthCheck = 10;
    apiTest = 30;
    shutdown = 30;
  };

  # QEMU emulated timeouts (aarch64 — slower)
  timeoutsQemu = {
    build = 2400;
    processStart = 5;
    vmBoot = 120;
    metabaseStart = 600;
    healthCheck = 20;
    apiTest = 60;
    shutdown = 60;
  };

  # QEMU slow emulation timeouts (riscv64 — slowest)
  timeoutsQemuSlow = {
    build = 3600;
    processStart = 10;
    vmBoot = 180;
    metabaseStart = 900;
    healthCheck = 30;
    apiTest = 90;
    shutdown = 60;
  };

  # Get appropriate timeouts for an architecture
  getTimeouts =
    arch:
    if architectures.${arch}.useKvm or false then
      timeouts
    else if arch == "riscv64" then
      timeoutsQemuSlow
    else
      timeoutsQemu;

  # ==========================================================================
  # VM naming
  # ==========================================================================

  vmNamePrefix = "mb-test";

  archHostname = {
    x86_64 = "x86-64";
    aarch64 = "aarch64";
    riscv64 = "riscv64";
  };

  getHostname = arch: "mb-test-${archHostname.${arch}}";
  getProcessName = arch: "mb-test-${archHostname.${arch}}";

  # ==========================================================================
  # Metabase-specific endpoints
  # ==========================================================================

  healthEndpoint = "http://localhost:30000/api/health";
  setupEndpoint = "http://localhost:30000/api/session/properties";
  metabasePort = 30000;
}
