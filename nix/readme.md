# Metabase Nix Configuration

Reproducible builds, development environments, and container images for Metabase using Nix.

## Table of Contents

- [Background](#background)
  - [Why Nix for Metabase?](#why-nix-for-metabase)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Module Structure](#module-structure)
- [Sub-Derivation Pipeline](#sub-derivation-pipeline)
- [Source Filtering](#source-filtering)
- [Reproducibility](#reproducibility)
- [Dependency Pinning](#dependency-pinning)
- [Dev Shell](#dev-shell)
- [Building](#building)
- [OCI Containers](#oci-containers)
  - [Per-Driver Images](#per-driver-images)
  - [Font Variants](#font-variants)
  - [JVM Configuration](#jvm-configuration)
- [Core-Only Builds and Mountable Drivers](#core-only-builds-and-mountable-drivers)
- [Multi-Architecture Support](#multi-architecture-support)
- [Performance Tuning](#performance-tuning)
  - [`MB_LUDICROUS_SPEED=true`](#mb_ludicrous_speedtrue)
  - [Variant Benchmarks](#variant-benchmarks)
- [MicroVM Lifecycle Tests](#microvm-lifecycle-tests)
- [Integration Tests](#integration-tests)
- [Verification Scripts](#verification-scripts)
- [Custom JRE with jlink (Future Optimization)](#custom-jre-with-jlink-future-optimization)
- [Troubleshooting](#troubleshooting)

## Background

[Nix](https://nixos.org) is a package manager for Linux and macOS that provides **reproducible, isolated** environments. By tracking all dependencies and hashing their content, it ensures every developer uses the same versions of every tool.

### Why Nix for Metabase?

- **Reproducible builds** — identical output regardless of host system; no more "it worked on my machine"
- **Fast onboarding** — `nix develop` downloads and configures JDK, Clojure, Node.js, Bun, and all other tools automatically
- **Granular caching** — the build is split into independent sub-derivations so changing a backend file doesn't rebuild the frontend
- **Multi-architecture** — build OCI container images for x86_64, aarch64, and riscv64 from a single machine
- **No global pollution** — all dependencies live in `/nix/store`, leaving your system packages untouched

You do **not** need to run NixOS. Nix works alongside any Linux distribution or macOS.

## Prerequisites

### Install Nix

If you already have Nix installed, skip to [Quick Start](#quick-start).

**Recommended: Determinate Systems installer** (enables flakes automatically):
```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh
```

**Alternative: Official installer**

- Multi-user (recommended):
  ```bash
  bash <(curl -L https://nixos.org/nix/install) --daemon
  ```
- Single-user:
  ```bash
  bash <(curl -L https://nixos.org/nix/install) --no-daemon
  ```

If using the official installer, enable flakes:
```bash
test -d /etc/nix || sudo mkdir /etc/nix
echo 'experimental-features = nix-command flakes' | sudo tee -a /etc/nix/nix.conf
```

#### Video Tutorials

| Platform | Video |
|----------|-------|
| Ubuntu | [Installing Nix on Ubuntu](https://youtu.be/cb7BBZLhuUY) |
| Fedora | [Installing Nix on Fedora](https://youtu.be/RvaTxMa4IiY) |

#### Learn More

- [Nix official site](https://nixos.org)
- [Nix Flakes Wiki](https://nixos.wiki/wiki/flakes)
- [Search Nix packages](https://search.nixos.org/packages?channel=unstable)

## Quick Start

```bash
# Enter development shell (all tools pre-configured)
nix develop

# Build Metabase from source
nix build

# Run the built Metabase
./result/bin/metabase

# Build an OCI container image
nix build .#oci-x86_64
```

**Optional: direnv integration** — create a `.envrc` with `use flake` for automatic shell activation when you `cd` into the project directory. See [direnv wiki](https://github.com/direnv/direnv/wiki/Nix) for setup.

## Module Structure

| File | Purpose | Cache Trigger |
|------|---------|---------------|
| `packages.nix` | Dependency declarations (4 tiers) | — |
| `env-vars.nix` | Shell environment variables | — |
| `devshell.nix` | Developer shell configuration | — |
| `derivation/deps-clojure.nix` | Maven/Clojure dependency prefetch ([FOD](#fixed-output-derivation-fod-hash-updates)) | `deps.edn` |
| `derivation/deps-frontend.nix` | Bun/Node dependency prefetch ([FOD](#fixed-output-derivation-fod-hash-updates)) | `bun.lock` |
| `derivation/translations.nix` | i18n artifact build | `locales/`, `src/` |
| `derivation/frontend.nix` | Frontend build (rspack + shadow-cljs) | `frontend/`, `src/` |
| `derivation/static-viz.nix` | Static visualization bundle (rspack) | `frontend/`, `src/` |
| `derivation/drivers.nix` | Per-driver JAR builds (17 derivations) | `modules/`, `src/` |
| `derivation/uberjar.nix` | Final JAR assembly (with deterministic repack) | `src/` |
| `derivation/NormalizeProxyClasses.java` | ASM-based proxy class bytecode normalizer | — |
| `derivation/lib.nix` | Shared build helpers (frontendBuildInputs, setupClojureDeps, etc.) | — |
| `derivation/patch-git-deps.sh` | Patches git deps for offline builds | — |
| `derivation/patch-mvn-repos.sh` | Patches Maven repo URLs for offline builds | — |
| `derivation/default.nix` | Orchestrator: source filtering + wiring | — |
| `oci/default.nix` | Multi-arch OCI container images (full, minimal, core, per-driver) | — |
| `oci/layers.nix` | Layer decomposition strategy (with CJK font toggle) | — |
| `microvms/constants.nix` | Ports, timeouts, lifecycle config | — |
| `microvms/default.nix` | VM entry point (all architectures) | — |
| `microvms/mkVm.nix` | NixOS test VM definition | — |
| `microvms/lib.nix` | Reusable polling/lifecycle helpers | — |
| `tests/default.nix` | Test entry point | — |
| `tests/lib.nix` | Reusable test helpers | — |
| `tests/health-check.nix` | `/api/health` polling test | — |
| `tests/api-smoke.nix` | `/api/session/properties` test | — |
| `tests/db-migration.nix` | PostgreSQL migration test | — |
| `tests/oci-lifecycle.nix` | OCI container lifecycle test | — |
| `tests/verify-oci-flags.nix` | Verify JVM flags in running OCI container | — |
| `tests/verify-oci-sizes.nix` | Compare OCI variant sizes | — |
| `tests/verify-core-drivers.nix` | Test core-only image with mounted drivers | — |
| `shell-functions/build.nix` | Build commands (mb-build, mb-repl, etc.) | — |
| `shell-functions/clean.nix` | Clean commands (mb-clean-frontend, etc.) | — |
| `shell-functions/database.nix` | PostgreSQL commands (pg-start, pg-stop, etc.) | — |
| `shell-functions/navigation.nix` | Navigation commands (mb-src, mb-frontend, etc.) | — |
| `shell-functions/validation.nix` | Environment check and help (mb-check-env, mb-help) | — |

## Sub-Derivation Pipeline

Instead of one monolithic build, we split into **7 cached stages**. Each stage receives a **filtered source tree** containing only the directories it needs, so changing a backend `.clj` file won't invalidate the frontend cache and vice versa.

```
┌─────────────────┐    ┌──────────────────┐
│  deps-clojure   │    │  deps-frontend   │    ← FODs: only rebuild when lockfiles change
│  (full src)     │    │  (full src)      │
└───────┬─────────┘    └────────┬─────────┘
        │                       │
   ┌────┼──────────────────┐      │
   │    │                  │      ├──────────────┐
   │    │                  │      │              │
   ▼    ▼                  ▼      ▼              ▼
┌──────┐ ┌──────────────┐ ┌────────┐ ┌──────────┐
│trans-│ │ 17 individual│ │frontend│ │static-viz│  ← filtered source per derivation
│lation│ │   drivers    │ │(rspack │ │(rspack   │
│(i18n)│ │ (parallel)   │ │+cljs)  │ │+cljs)    │
└──┬───┘ └──────┬───────┘ └───┬────┘ └────┬─────┘
   │      ┌─────▼──────┐      │           │
   │      │ drivers-all│      │           │
   │      │ (merge)    │      │           │
   │      └─────┬──────┘      │           │
   └────────┬───┘─────────────┴───────────┘
            │
   ┌────────▼────────────────────┐
   │          uberjar            │               ← final assembly, combines all above
   │    (metabase.jar)           │
   └─────────────┬───────────────┘
                 │
   ┌─────────────▼──────────────┐
   │       metabase             │               ← wrapper script (no source needed)
   └─────────────┬──────────────┘
                 │
     ┌───────────┼───────────────┐
     │           │               │
┌────▼────┐ ┌───▼────┐  ┌──────▼──────┐
│OCI x86  │ │OCI arm │  │OCI riscv64  │        ← arch-specific: only JRE layer differs
└─────────┘ └────────┘  └─────────────┘
```

**Cache wins with source filtering:**

| Change | Rebuilds | Skips |
|--------|----------|-------|
| `src/metabase/*.clj` | translations, all drivers, uberjar | frontend, static-viz |
| `frontend/src/**` | frontend, static-viz | translations, all drivers |
| `modules/drivers/clickhouse/**` | driver-clickhouse, drivers-all, uberjar | all other 16 drivers, frontend, static-viz, translations |
| `modules/drivers/**` (broad) | all drivers, uberjar | frontend, static-viz, translations |
| `locales/**` | translations | frontend, static-viz, all drivers |
| `deps.edn` | deps-clojure + all downstream | deps-frontend |
| Nothing | everything cached | — |

## Source Filtering

Each sub-derivation receives a filtered source tree via the `srcFor` helper in `default.nix`. This ensures derivations only rebuild when files they actually use change.

### How It Works

All top-level source directories are mapped to named **components** in the `sourceComponents` attrset:

```nix
sourceComponents = {
  backend   = [ "/src" "/enterprise/backend" "/.clj-kondo" ];
  frontend  = [ "/frontend" "/enterprise/frontend" "/docs" ];
  drivers   = [ "/modules" ];
  i18n      = [ "/locales" ];
  build     = [ "/bin" ];
  resources = [ "/resources" ];
  testing   = [ "/test" "/test_modules" ... ];
  tooling   = [ "/dev" "/cross-version" ... ];
};
```

Each derivation declares which components it needs:

```nix
translationFilter = [ "build" "backend" "resources" "i18n" ];
frontendFilter    = [ "build" "frontend" "backend" "resources" ];
driverFilter      = [ "build" "backend" "resources" "drivers" ];
uberjarFilter     = [ "build" "backend" "resources" ];
```

Root-level files (`deps.edn`, `package.json`, `shadow-cljs.edn`, etc.) are always included regardless of filter.

### Coverage Assertion

A Nix assertion ensures every top-level directory is mapped in `sourceComponents`. If a new directory is added to the repo without being mapped, `nix build` fails immediately:

```
error: Unmapped source directories: new-dir. Add them to sourceComponents in default.nix.
```

### Adding a New Top-Level Directory

1. `nix build` fails with the unmapped directory error
2. Add the directory to the appropriate component in `sourceComponents` (or create a new component)
3. If a derivation needs access to it, add the component name to that derivation's filter list

### Frontend / Static-Viz Split

The frontend is split into two independent derivations:

- **`frontend.nix`**: Main bundle (`bun run build-release`) — rspack + shadow-cljs
- **`static-viz.nix`**: Static visualization bundle (`bun run build-release:static-viz`) — rspack + shadow-cljs

Both use the same source filter (`frontendFilter`) since static-viz imports broadly from `frontend/src/metabase/`. Both need shadow-cljs output (the `cljs/` alias in rspack configs). The split allows them to build **in parallel**.

### Per-Driver Derivations

Each of the 17 database drivers is built as its own derivation. Changing the clickhouse driver source doesn't invalidate the snowflake cache, etc.

```bash
# Build a single driver
nix build .#driver-clickhouse
nix build .#driver-sqlite
nix build .#driver-sparksql

# Build all drivers (combined output)
nix build .#drivers
```

All 17 drivers: `athena`, `bigquery-cloud-sdk`, `clickhouse`, `databricks`, `druid`, `druid-jdbc`, `hive-like`, `mongo`, `oracle`, `presto-jdbc`, `redshift`, `snowflake`, `sparksql`, `sqlite`, `sqlserver`, `starburst`, `vertica`.

The `drivers.all` derivation is a lightweight aggregator that copies all individual JARs into a single output — it doesn't rebuild anything, just merges store paths. The `uberjar` derivation consumes this combined output.

**Driver dependencies**: sparksql depends on hive-like at the Clojure source level. The build system handles this automatically — each driver build has the full `modules/` source tree available.

## Reproducibility

Nix builds run inside a sandbox with no network access, no home directory, and no host-system leakage. Combined with pinned inputs (`flake.lock`) and filtered sources, this eliminates most sources of non-determinism. However, Java and Clojure introduce three additional challenges.

### JAR Determinism

JAR files are ZIP archives with embedded timestamps and non-deterministic file ordering. For smaller JARs (translations, drivers), we use nixpkgs' [`stripJavaArchivesHook`](https://github.com/NixOS/nixpkgs/issues/278518) to normalize timestamps and sort entries in the fixup phase.

For the ~400MB uberjar, `stripJavaArchivesHook` is too slow (8+ hours via `strip-nondeterminism`'s entry-by-entry Perl processing). Instead, the uberjar build uses a deterministic extract-filter-repack: extract the JAR, strip AOT-shadowed source files, normalize filesystem timestamps, and repack with JDK 21's `jar --date=TIMESTAMP` flag. This produces an identical JAR directly in minutes, with no fixup phase needed.

See also [Farid Zakaria's blog post on Java+Nix reproducibility](https://fzakaria.com/2021/06/27/java-nix-reproducibility.html).

### Clojure Bytecode Determinism

Clojure's compiler uses `Object.hashCode()` internally (via `LocalBinding`) to determine iteration order when emitting closed-over variables in bytecode. The JVM's default `hashCode` algorithm (mode 5, Marsaglia xor-shift) is seeded from memory addresses, making it non-deterministic across runs. This is a [known issue](https://ask.clojure.org/index.php/12249) in the Clojure ecosystem.

We set `-XX:hashCode=2` via `JAVA_TOOL_OPTIONS` during all Clojure compilation. Mode 2 returns a constant value for all identity hash codes, which eliminates hash-based ordering variability entirely. We initially tried mode 3 (global atomic counter), but it proved insufficient — JVM background threads (JIT compiler, GC) consume counter values non-deterministically, causing 2,845 class files to differ between builds. Mode 2 reduced this to a single file.

### Clojure Proxy Class Determinism

The last source of non-determinism is Clojure's `proxy` macro, which uses `Class.getConstructors()` to enumerate parent class constructors. The JDK spec explicitly states this method may return constructors in any order. This produces proxy classes with non-deterministic constructor ordering in both the method table and constant pool.

The uberjar build includes a post-compilation normalization step (`NormalizeProxyClasses.java`) that uses ASM to rewrite proxy class files with methods sorted by `(name, descriptor)`. ASM's ClassWriter naturally rebuilds the constant pool in visitation order, producing identical bytecode regardless of the original reflection ordering. This normalizes all ~100 proxy classes in the uberjar in under a second.

### Dependency FOD Determinism

The Clojure dependency FOD (`deps-clojure.nix`) downloads from Maven Central and Clojars. Several post-processing steps ensure the FOD produces identical output across rebuilds:

1. **`*.lastUpdated` files** — deleted (pure timestamp, no useful data)
2. **`_remote.repositories` files** — deleted (contain download timestamps)
3. **`resolver-status.properties`** — timestamps normalized to 0
4. **`maven-metadata-*.xml`** — `<lastUpdated>` tags normalized to 0
5. **POM version ranges** — `[1.2.1],[1.3.0]` (from `colorize:0.1.1`) patched to concrete versions so offline resolution works without reaching unreachable POM-declared repos

### Verifying Reproducibility

Use `nix build --rebuild` to build a derivation twice and compare outputs:

```bash
# Single derivation
nix build .#translations --rebuild

# All Clojure-compiled derivations (translations, uberjar, drivers)
nix run .#check-reproducibility

# All derivations including frontend
nix run .#check-reproducibility -- --all
```

If a check fails, use [diffoscope](https://diffoscope.org/) to inspect differences between the two builds.

## Dependency Pinning

All dependencies — from the JDK to every Maven artifact — are pinned to exact versions through three mechanisms.

### `flake.lock` and nixpkgs pinning

`flake.nix` declares `nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable"`, but `flake.lock` pins to an exact commit with two fields:

- **`rev`** — the exact nixpkgs git commit hash
- **`narHash`** — SHA-256 of the Nix Archive (NAR) serialization of the nixpkgs source tree at that commit (content-based verification)

This means every developer and CI build uses the same nixpkgs snapshot regardless of when `nix build` runs. To bump to a newer nixpkgs:

```bash
nix flake update    # updates flake.lock with latest nixpkgs commit + narHash
```

`flake.lock` is checked into git, so the pin is versioned and reviewable in PRs.

### Transitive Java version resolution

`nix/packages.nix` declares `jdk = pkgs.temurin-bin-21` and `jre = pkgs.temurin-jre-bin-21`. Since `pkgs` comes from the pinned nixpkgs commit, the exact Temurin patch version (e.g., 21.0.5+11) is determined by that commit. Different nixpkgs commits may ship different patch versions.

To check which version you're pinned to:

```bash
nix develop --command java --version
```

### FOD hash verification

`deps-clojure.nix` and `deps-frontend.nix` are Fixed-Output Derivations (FODs) with `outputHash` fields. These SHA-256 hashes cover the entire output directory — every Maven JAR, every npm package, byte for byte.

If upstream dependencies change (e.g., a new dependency is added to `deps.edn` or `bun.lock`), the hash won't match and the build fails loudly with the expected vs actual hash. This prevents silent dependency drift.

See [FOD Hash Updates](#fixed-output-derivation-fod-hash-updates) for how to update hashes after changing lockfiles.

## Dev Shell

The dev shell provides all tools needed for Metabase development:

```bash
nix develop
```

### Available Commands

| Command | Description |
|---------|-------------|
| `mb-help` | Show all available commands |
| `mb-check-env` | Verify all tool versions |
| **Navigation** | |
| `mb-src` | `cd` to `src/metabase` |
| `mb-frontend` | `cd` to `frontend` |
| `mb-test` | `cd` to `test` |
| `mb-drivers` | `cd` to `modules/drivers` |
| `mb-root` | `cd` to project root |
| **Build** | |
| `mb-build` | Full build (all steps) |
| `mb-build-frontend` | Build frontend only |
| `mb-build-backend` | Build uberjar only |
| `mb-build-drivers` | Build drivers only |
| `mb-build-i18n` | Build i18n artifacts |
| `mb-repl` | Start Clojure REPL |
| **Clean** | |
| `mb-clean-frontend` | Remove `node_modules` and frontend artifacts |
| `mb-clean-backend` | Remove `target/` |
| `mb-clean-all` | Remove all build artifacts |
| **Database** | |
| `pg-start` | Start local PostgreSQL (auto-initializes) |
| `pg-stop` | Stop local PostgreSQL |
| `pg-reset` | Wipe and reinitialize PostgreSQL |
| `pg-create [name]` | Create database (default: `metabase`) |

### Typical Workflow

```bash
nix develop           # Enter dev shell
pg-start              # Start PostgreSQL
pg-create metabase    # Create database
mb-repl               # Start REPL for backend dev
# or
mb-build-frontend     # Build frontend
mb-build              # Full build
```

## Building

```bash
# Full build (produces result/bin/metabase)
nix build

# Individual sub-derivations
nix build .#frontend            # Frontend main bundle only
nix build .#static-viz          # Static visualization bundle only
nix build .#translations        # i18n artifacts only
nix build .#drivers             # All database drivers
nix build .#driver-clickhouse   # Single driver (any of 17)
nix build .#uberjar             # Final JAR only
```

## OCI Containers

Multi-architecture container images in several variants:

```bash
# Full image (with CJK fonts, all drivers)
nix build .#oci-x86_64     # AMD64
nix build .#oci-aarch64    # ARM64
nix build .#oci-riscv64    # RISC-V 64

# Minimal image (without CJK fonts)
nix build .#oci-minimal-x86_64
nix build .#oci-minimal-aarch64
nix build .#oci-minimal-riscv64

# Core-only image (no bundled external drivers — see Core-Only Builds below)
nix build .#oci-core-x86_64

# Per-driver image (core + one specific driver baked in)
nix build .#oci-clickhouse-x86_64
nix build .#oci-snowflake-x86_64
nix build .#oci-mongo-x86_64

# Load and run (x86_64 example)
./result | docker load
docker run -p 3000:3000 metabase:0.0.0-nix-x86_64
```

### Image Sizes

| Variant | Size | Savings vs Full | Notes |
|---|---|---|---|
| `oci-x86_64` (full) | ~1290 MB | — | All drivers + CJK fonts |
| `oci-minimal-x86_64` | ~1228 MB | ~62 MB (5%) | All drivers, no CJK fonts |
| `oci-core-x86_64` | ~1048 MB | ~242 MB (19%) | No external drivers, with CJK fonts |
| `oci-clickhouse-x86_64` | ~953 MB | ~337 MB (26%) | Core + one driver (representative) |

The full image contains ~98 Nix store path layers:

| Component | Approximate Size | Notes |
|---|---|---|
| JRE (Temurin 21) | ~200 MB | Changes with JDK updates |
| Metabase JAR + wrapper | ~400 MB | Changes each build |
| CJK fonts (Noto) | ~62 MB | Rarely changes; absent in minimal variant |
| System libraries (glib, gtk, etc.) | ~300 MB | Transitive deps of JRE/fonts |
| Base utilities (bash, coreutils, curl) | ~50 MB | Rarely changes |
| CA certificates, other fonts | ~50 MB | Rarely changes |

### Per-Driver Images

For production deployments that connect to a single database, per-driver images are the simplest option. Each one contains the core Metabase (with built-in Postgres, MySQL, H2) plus exactly one external driver baked in.

```bash
# Build and run a Snowflake-only image
nix build .#oci-snowflake-x86_64
./result | docker load
docker run -p 3000:3000 metabase-snowflake:0.0.0-nix-x86_64
```

These images reuse all the same Nix store paths as the core image. Building `oci-snowflake-x86_64` after you've already built `oci-core-x86_64` takes seconds — it only adds the driver JAR layer. The same applies to disk space in the Nix store: no duplication.

If you need multiple external drivers, you have three options:
1. **Full image** (`oci-x86_64`) — all 17 drivers included
2. **Volume mount** — use `oci-core-x86_64` and mount multiple driver JARs at `/plugins`
3. **Custom Nix composition** — extend the layer system to combine specific drivers (see `nix/oci/default.nix`)

### Font Variants

The **full** images (`oci-{arch}`) include Noto CJK Sans (~62 MB), which provides Chinese, Japanese, and Korean character rendering in chart PNGs and email notifications. Metabase uses Lato as its primary font; characters Lato can't render fall back to the system `sans-serif` font. Without CJK system fonts, those characters render as tofu (empty boxes).

The **minimal** images (`oci-minimal-{arch}`) omit CJK fonts. This is safe for English-language deployments that don't need CJK character rendering in charts or emails.

### JVM Configuration

The OCI entrypoint runs the JVM with production-tuned flags:

| Flag | Purpose |
|------|---------|
| `-XX:+UseZGC` | Generational ZGC (JEP 439) — sub-millisecond pause times, production-ready in JDK 21 |
| `-XX:+UseContainerSupport` | Detect cgroup memory limits |
| `-XX:MaxRAMPercentage=75.0` | Cap heap at 75% of container memory |
| `-XX:+CrashOnOutOfMemoryError` | Force crash dump on OOM for diagnosis |
| `-server` | Server JIT compiler |
| `-Dfile.encoding=UTF-8` | Consistent encoding |
| `--add-opens java.base/java.nio=ALL-UNNAMED` | Snowflake JDBC compatibility |

These flags match the Docker image entrypoint (`bin/docker/run_metabase.sh`), minus `-XX:+IgnoreUnrecognizedVMOptions` — since Nix pins the exact JRE version, all flags are known-valid, and failing fast on unknown flags is better than silently ignoring them.

**Adding custom flags**: Set the `JAVA_OPTS` environment variable to pass additional JVM flags:

```bash
docker run -p 3000:3000 \
  -e JAVA_OPTS="-Xmx4g -Dlog4j2.formatMsgNoLookups=true" \
  metabase:0.0.0-nix-x86_64
```

**Note on ZGC**: Generational ZGC provides excellent latency for interactive workloads like Metabase dashboards. If you experience throughput issues with batch workloads, you can switch to G1GC via `JAVA_OPTS="-XX:+UseG1GC -XX:-UseZGC"`.

## Core-Only Builds and Mountable Drivers

The default build bundles all 17 external database drivers into the uberjar. The **core-only** variant omits these, producing a smaller JAR. Users mount only the driver JARs they need at `/plugins`.

### Built-in vs external drivers

Postgres, MySQL, and H2 are compiled into the core JAR — they're always available regardless of build variant.

The 17 external drivers (each built as a separate JAR) are: `athena`, `bigquery-cloud-sdk`, `clickhouse`, `databricks`, `druid`, `druid-jdbc`, `hive-like`, `mongo`, `oracle`, `presto-jdbc`, `redshift`, `snowflake`, `sparksql`, `sqlite`, `sqlserver`, `starburst`, `vertica`.

### Usage

The easiest approach is per-driver OCI images — each one bakes in exactly one driver on top of the core image. Since they reuse the same Nix store paths as the core image, they add negligible build time and disk space.

```bash
# Per-driver OCI image (recommended for production)
nix build .#oci-clickhouse-x86_64
./result | docker load
docker run -p 3000:3000 metabase-clickhouse:0.0.0-nix-x86_64

# Multiple drivers? Build and load each, then pick the one you need:
nix build .#oci-snowflake-x86_64
nix build .#oci-mongo-x86_64
```

All 17 per-driver images are available: `oci-athena-{arch}`, `oci-bigquery-cloud-sdk-{arch}`, `oci-clickhouse-{arch}`, `oci-databricks-{arch}`, `oci-druid-{arch}`, `oci-druid-jdbc-{arch}`, `oci-hive-like-{arch}`, `oci-mongo-{arch}`, `oci-oracle-{arch}`, `oci-presto-jdbc-{arch}`, `oci-redshift-{arch}`, `oci-snowflake-{arch}`, `oci-sparksql-{arch}`, `oci-sqlite-{arch}`, `oci-sqlserver-{arch}`, `oci-starburst-{arch}`, `oci-vertica-{arch}`.

Alternatively, use the core-only image with volume-mounted drivers for maximum flexibility:

```bash
# Core-only OCI image + volume mount
nix build .#oci-core-x86_64
./result | docker load

docker run -p 3000:3000 \
  -v $(nix build .#driver-clickhouse --print-out-paths)/plugins/clickhouse.metabase-driver.jar:/plugins/clickhouse.metabase-driver.jar \
  metabase-core:0.0.0-nix-x86_64
```

You can also build the core-only package directly (without OCI):

```bash
nix build .#metabase-core
nix build .#driver-clickhouse
nix build .#driver-sqlite
```

### Size savings

The core-only image is ~242 MB (19%) smaller than the full image. While the external driver JARs themselves total ~30-50 MB, the full savings come from eliminating transitive native dependencies that some drivers pull in. For production deployments connecting to a single database, this is a meaningful reduction in image pull time, storage, and attack surface — you only ship the code you use.

### Composing with font variants

There is no `oci-core-minimal-{arch}` variant. Users wanting both core-only and no CJK fonts can compose custom images using the Nix layer system. This can be revisited if there's demand.

## Multi-Architecture Support

Metabase's JAR is architecture-independent (JVM bytecode). Multi-arch support means:
- **Build**: Always on host — single JAR works everywhere
- **OCI**: Per-arch JRE + system packages (3 variants)
- **MicroVMs**: Per-arch NixOS VMs with arch-specific timeouts

| Architecture | Acceleration | Startup Time |
|---|---|---|
| x86_64 | KVM (native) | ~30s |
| aarch64 | QEMU TCG (emulated) | ~120s |
| riscv64 | QEMU TCG (emulated) | ~180s |

## Performance Tuning

### `MB_LUDICROUS_SPEED=true`

Named after the *Spaceballs* (1987) speed setting, this environment variable skips Metabase's per-row statistical insights pipeline (`insights-xform`), which computes trend analysis and anomaly detection badges for dashboard cards. This pipeline is the single largest source of query processing overhead — it recreates Clojure maps for every row, triggering `clojure.lang.Util.hasheq()` as the dominant CPU hotspot.

**We recommend enabling this for most deployments.** The only feature lost is the small trend/anomaly badges on dashboard cards (e.g., "↑12% vs last period"). All other Metabase functionality — questions, dashboards, alerts, exports, embedding, and the query API — works identically.

```bash
# Environment variable
MB_LUDICROUS_SPEED=true

# Docker
docker run -p 3000:3000 -e MB_LUDICROUS_SPEED=true metabase:latest

# Nix
MB_LUDICROUS_SPEED=true ./result/bin/metabase

# Also toggleable at runtime via Admin > Settings or the API
curl -X PUT http://localhost:3000/api/setting/ludicrous-speed -H 'Content-Type: application/json' -d '{"value": true}'
```

**Measured performance gains** (NixOS VM, 20K rows, PostgreSQL and ClickHouse):

| Query | Cols | With insights (ms) | Ludicrous Speed (ms) | Speedup |
|-------|------|--------------------|----------------------|---------|
| SELECT 1 | 1 | 101 | 71 | 1.43x |
| 1col x 20K | 1 | 288 | 172 | 1.67x |
| 6col x 20K | 6 | 545 | 236 | **2.30x** |
| 20col x 20K | 20 | 1089 | 596 | **1.83x** |
| 50col x 20K | 50 | 2754 | 1256 | **2.19x** |
| 100col x 20K | 100 | 3537 | 2419 | 1.46x |

ClickHouse results show the same pattern — **up to 2.7x speedup** — confirming the overhead is in Metabase's core pipeline, not any specific database driver.

For full root cause analysis, code archaeology, and additional remediation options, see [performance-analysis.md](performance-analysis.md).

### Variant Benchmarks

The Nix build system includes a variant benchmark framework that builds multiple patched versions of Metabase and benchmarks them side-by-side in a single NixOS VM. This provides reproducible, apples-to-apples comparisons of performance changes.

Three variants are included:

| Variant | What it does | Patch |
|---------|-------------|-------|
| `vanilla` | Unmodified Metabase (baseline) | — |
| `no-insights` | `insights-xform` unconditionally skipped | `nix/patches/skip-insights-all.patch` |
| `skip-dash` | Insights skipped for dashboard card queries only | `nix/patches/skip-insights-dashboard.patch` |

```bash
# Build and run the variant benchmark (boots one VM, tests all 3 variants)
nix build .#bench-variants-x86_64

# View results
nix log .#bench-variants-x86_64 2>&1 | grep 'PERF:'
```

Only the uberjar stage rebuilds per variant — frontend, translations, dependencies, and drivers are cached and shared across all variants.

To add a new variant, create a patch file in `nix/patches/`, add a `mkVariant` call in `nix/derivation/default.nix`, and add it to the `variants` list in `flake.nix`.

## MicroVM Lifecycle Tests

NixOS VM tests that boot a complete system with PostgreSQL and Metabase:

```bash
# Build and run NixOS VM test
nix build .#microvm-test-x86_64

# Full lifecycle test with timing
nix run .#mb-lifecycle-full-test-x86_64

# Individual lifecycle phases
nix run .#mb-lifecycle-0-build-x86_64
nix run .#mb-lifecycle-3-check-health-x86_64

# Test all architectures
nix run .#mb-test-all
```

### Lifecycle Phases

| Phase | Name | Description |
|-------|------|-------------|
| 0 | Build | Build VM derivation |
| 1 | Process | Verify VM process started |
| 2 | Boot | Wait for VM to boot |
| 3 | Health | Wait for `/api/health` to return ok |
| 4 | API | Smoke test `/api/session/properties` |
| 5 | Shutdown | Send shutdown signal |
| 6 | Exit | Wait for process exit |

## Integration Tests

```bash
# Run all tests
nix run .#tests-all

# Individual tests
nix run .#tests-health-check
nix run .#tests-api-smoke
nix run .#tests-db-migration

# OCI lifecycle tests
nix run .#tests-oci-x86_64
```

## Verification Scripts

Repeatable scripts for validating OCI container behavior after upgrades:

| Command | Description |
|---------|-------------|
| `nix run .#verify-oci-flags` | Verify JVM flags (ZGC, container support) in running OCI container |
| `nix run .#verify-oci-sizes` | Build all OCI variants and compare sizes |
| `nix run .#verify-core-drivers` | Test core-only image with mounted driver plugins |

These scripts require Docker. They build OCI images, start containers, and verify behavior end-to-end.

```bash
# Verify JVM flags after upgrading JRE or changing entrypoint
nix run .#verify-oci-flags

# Compare OCI variant sizes (useful after dependency changes)
nix run .#verify-oci-sizes

# Verify core-only image loads drivers from /plugins
nix run .#verify-core-drivers
```

## Custom JRE with jlink (Future Optimization)

`jlink` is a JDK tool that creates a custom Java runtime containing only the modules an application needs, reducing the JRE size.

### How it would work

A new Nix derivation would run:

```bash
jlink --module-path ${jdk}/jmods \
  --add-modules java.base,java.desktop,java.sql,java.management,java.naming,java.logging,java.xml,jdk.crypto.ec,jdk.zipfs,jdk.unsupported \
  --output $out
```

### Estimated savings

Full JRE is ~200 MB. A custom runtime would be ~100-120 MB — modest savings because `java.desktop` (one of the larger modules) is required for AWT-based chart PNG rendering.

### Required modules

| Module | Reason |
|--------|--------|
| `java.base` | Core runtime |
| `java.desktop` | AWT/PNG chart rendering |
| `java.sql` | JDBC database connectivity |
| `java.management` | JMX monitoring |
| `java.naming` | JNDI (used by connection pooling) |
| `java.logging` | JUL logging bridge |
| `java.xml` | XML parsing (config, SAML) |
| `jdk.crypto.ec` | TLS with ECDHE ciphers |
| `jdk.zipfs` | ZIP filesystem (JAR handling) |
| `jdk.unsupported` | `sun.misc.Unsafe` (used by various libs) |

### Trade-offs

- **Risk**: Plugins and third-party drivers may need modules not in the custom runtime, causing `ClassNotFoundException` at runtime. Each new driver would need testing against the custom JRE.
- **Maintenance**: New libraries added to Metabase may require updating the module list.
- **`java.desktop`** is one of the larger modules but is required for chart PNG rendering — it can't be removed.
- **~7% total image size reduction** (80-100 MB savings on a ~1290 MB image) — core-only builds (~242 MB savings) provide larger and safer wins.

### Recommendation

Defer until OCI image size becomes a deployment bottleneck. When ready, start by running `jdeps --print-module-deps` on the uberjar to determine the exact module set:

```bash
jdeps --print-module-deps --ignore-missing-deps target/uberjar/metabase.jar
```

## TODO / Future Work

- **Investigate Metabase default row limit**: Metabase caps native query results at 2,000 rows (`max-results-bare-rows`) by default. This was introduced as a safety limit but may be too aggressive for analytics workloads. Callers can override via the `constraints` parameter in `/api/dataset`, but the default affects all native queries in the UI. Consider proposing an increase (e.g., 10K or 20K) or making it user-configurable per database.

- **Frontend/static-viz reproducibility**: `rspack` and `shadow-cljs` produce non-deterministic output. These are the only two targets that fail `check-reproducibility --all`. Separate investigation needed.

## Troubleshooting

### Debug Mode

```bash
MB_NIX_DEBUG=1 nix develop
```

This prints all environment variables and enables shell tracing.

### Fixed-Output Derivation (FOD) Hash Updates

After changing `deps.edn` or `bun.lock`, the Fixed-Output Derivation (FOD) hashes need updating. FODs are Nix derivations whose output is identified by a content hash rather than by their build instructions — this allows Nix to cache dependency fetches and skip re-downloading when the output hasn't changed.

1. The build will fail with a hash mismatch
2. Copy the "got:" hash from the error message
3. Update the `outputHash` in `deps-clojure.nix` or `deps-frontend.nix`

### Common Issues

**`nix develop` is slow first time**: Nix downloads all tools from the binary cache. Subsequent invocations are instant.

**Build fails with OOM**: Increase JVM heap: `export NODE_OPTIONS="--max-old-space-size=8192"` before building frontend.

**PostgreSQL socket errors**: Ensure `.pgsocket` directory exists and has correct permissions. Run `pg-reset` to start fresh.
