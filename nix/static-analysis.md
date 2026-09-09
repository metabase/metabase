# Static Analysis

Modular static analysis tooling for Metabase, surfaced as Nix targets. Each tool runs in an isolated, reproducible environment — no local installation required beyond Nix itself.

## Table of Contents

- [Quick Start](#quick-start)
- [Tool Overview](#tool-overview)
- [SpotBugs + FindSecBugs](#spotbugs--findsecbugs)
  - [Why Bytecode Analysis on a Clojure Project?](#why-bytecode-analysis-on-a-clojure-project)
  - [What It Finds](#what-it-finds)
  - [Suppression Strategy](#suppression-strategy)
  - [Usage](#spotbugs-usage)
- [clj-kondo](#clj-kondo)
- [Eastwood](#eastwood)
- [kibit](#kibit)
- [nvd-clojure (CVE Scanning)](#nvd-clojure-cve-scanning)
- [Combined Runner](#combined-runner)
- [Adding a New Analyzer](#adding-a-new-analyzer)
- [Module Structure](#module-structure)

## Quick Start

```bash
# Run a specific analyzer
nix run .#check-kondo        # fast — Clojure lint
nix run .#check-spotbugs     # slow — needs uberjar build first

# Run everything
nix run .#check-all-static
```

All tools except `check-nvd` work fully offline. `check-nvd` requires network access to fetch the NVD vulnerability database.

## Tool Overview

| Tool | Analyzes | Speed | Requires Build? | Network? |
|------|----------|-------|-----------------|----------|
| SpotBugs + FindSecBugs | Bytecode (.class) | Very slow (see [performance notes](#spotbugs-performance)) | Yes (uberjar) | No |
| clj-kondo | Clojure source | Fast (seconds) | No | No |
| Eastwood | Clojure source | Medium (loads all namespaces) | No | No |
| kibit | Clojure source | Fast (seconds) | No | No |
| nvd-clojure | deps.edn dependency tree | Medium | No | Yes |

## SpotBugs + FindSecBugs

[SpotBugs](https://spotbugs.github.io/) is a bytecode analysis tool that detects bugs in Java programs. [FindSecBugs](https://find-sec-bugs.github.io/) is a SpotBugs plugin that adds 150+ security-focused detectors.

### Why Bytecode Analysis on a Clojure Project?

Metabase is 99.9% Clojure, but SpotBugs operates on bytecode — it analyzes the AOT-compiled `.class` files inside the uberjar. This is useful for three reasons:

1. **Transitive Java dependencies**: The uberjar bundles clickhouse-jdbc, Apache HttpClient, and dozens of other Java libraries. SpotBugs + FindSecBugs scan all of them for SQL injection, XXE, insecure deserialization, weak crypto, and other security issues.

2. **Java interop boundary**: Clojure code that calls Java methods (JDBC connections, input streams, HTTP clients) can introduce resource leaks and null-dereference paths that Clojure-level linters can't detect.

3. **Security detectors**: FindSecBugs detectors are directly relevant to Metabase's database driver code — SQL injection patterns in parameter substitution, unclosed `Connection`/`ResultSet` handles, insecure TLS configurations.

### What It Finds

**Genuinely useful findings:**

| Category | Examples | Relevant Metabase code |
|----------|----------|----------------------|
| SQL injection | `SQL_INJECTION_JDBC`, `SQL_INJECTION_JPA` | `clickhouse_native.clj` `substitute-params`, all JDBC drivers |
| Resource leaks | Unclosed `InputStream`, `Connection`, `ResultSet` | ClickHouse `QueryResponse` handling, all DB drivers |
| XXE | `XXE_SAXPARSER`, `XXE_DOCUMENT` | XML parsing in SAML, config |
| Insecure deserialization | `OBJECT_DESERIALIZATION` | Session handling, caching |
| Weak crypto | `WEAK_MESSAGE_DIGEST_SHA1`, `DES_USAGE` | Token generation, password hashing |
| Null dereference | `NP_NULL_ON_SOME_PATH` | Java interop return values |

**Expected false positives (suppressed):**

Clojure's compiler generates bytecode patterns that trigger many SpotBugs detectors designed for hand-written Java. These are suppressed in `config/static-analysis/spotbugs-exclude.xml`:

| Bug Pattern | Why It's a False Positive |
|-------------|--------------------------|
| `SE_NO_SERIALVERSIONID` | Clojure records implement `Serializable` by default |
| `MS_SHOULD_BE_FINAL` | Clojure `def` compiles to mutable static fields |
| `UWF_UNWRITTEN_FIELD` | Clojure `deftype`/`defrecord` field initialization patterns |
| `EI_EXPOSE_REP` / `EI_EXPOSE_REP2` | Clojure closure inner classes |
| `URF_UNREAD_FIELD` | Clojure `deftype` fields read via Java interop |

Additionally, the `STYLE`, `I18N`, and `MALICIOUS_CODE` categories are suppressed entirely on `metabase.*` and `clojure.*` packages — these categories produce hundreds of findings on generated code with no actionable value.

### Suppression Strategy

The exclusion filter (`config/static-analysis/spotbugs-exclude.xml`) follows one rule: **never suppress SECURITY findings**. All FindSecBugs detectors run unfiltered against all packages, including Clojure-generated code and transitive Java dependencies.

The filter uses class-name regex matching:
- `metabase\..*` and `clojure\..*` — suppresses noise patterns and categories
- Third-party packages (e.g., `com.clickhouse.*`, `org.apache.*`) — no suppression at all

To adjust suppressions, edit `config/static-analysis/spotbugs-exclude.xml`. The format is documented in the [SpotBugs filter specification](https://spotbugs.readthedocs.io/en/stable/filter.html).

### SpotBugs Usage

```bash
# Targeted analysis (recommended) — specific packages only
nix run .#check-spotbugs -- --only-analyze 'metabase.driver.clickhouse.*,com.clickhouse.*'

# Broader scope — all Metabase driver code + transitive Java deps
nix run .#check-spotbugs -- --only-analyze 'metabase.driver.*,com.clickhouse.*,org.apache.http.*'

# Full uberjar (not recommended — see performance notes below)
nix run .#check-spotbugs

# Produce XML report (for CI integration or GUI viewers)
nix run .#check-spotbugs -- --only-analyze 'metabase.driver.*' --xml
```

SpotBugs needs the uberjar as input. If the uberjar hasn't been built yet, the first run will trigger a full Nix build (which may take 15-30 minutes depending on cache state). Subsequent runs reuse the cached uberjar.

Reports are written to `./spotbugs-report/`:
- `spotbugs.txt` — human-readable text (always produced)
- `spotbugs.xml` — XML with messages (when `--xml` is passed)

### SpotBugs Performance

The Metabase uberjar is ~400MB containing thousands of AOT-compiled Clojure classes plus all transitive Java dependencies. SpotBugs' interprocedural dataflow analysis (especially `IsNullValueAnalysis`) is **single-threaded** and has near-exponential complexity on the bytecode patterns Clojure's AOT compiler generates.

**Empirical results** (Threadripper PRO 3945WX, 24 cores, 128GB RAM):

| Configuration | Heap | Result |
|---------------|------|--------|
| Full uberjar, `effort:max`, `-Xmx768m` | 768MB (SpotBugs default) | Ran 11+ hours in GC death spiral, never completed |
| Full uberjar, `effort:default`, `-maxHeap 16384` | 16GB | RSS stable at ~12GB, ran 10+ hours, never completed |
| Full uberjar, `effort:max`, `-maxHeap 24576` | 24GB | Completed in ~17 hours, 149,235 findings (3,155 security) |
| Targeted `--only-analyze` (ClickHouse packages), `effort:max` | 24GB | Completed in ~5 minutes, 0 findings |

The bottleneck is **CPU, not memory**. RSS stabilizes well below the heap limit — the JVM isn't running out of memory, it's spending all its time in single-threaded null-pointer dataflow analysis across millions of bytecode paths.

**Recommendation**: Always use `--only-analyze` to target specific packages. Analyzing a single driver's packages (e.g., `metabase.driver.clickhouse.*,com.clickhouse.*`) completes in minutes and provides the highest-value security findings.

The `--effort` flag controls detector thoroughness:
- `max` (default) — all detectors, full interprocedural analysis
- `default` — fewer detectors, lighter analysis
- `min` — fastest, pattern matching only

## clj-kondo

[clj-kondo](https://github.com/clj-kondo/clj-kondo) is a Clojure/ClojureScript linter that uses static analysis. Metabase has an extensive kondo configuration with 20+ built-in linters and 16 custom Metabase-specific linters (in `.clj-kondo/`).

```bash
nix run .#check-kondo
```

This wraps the existing `:kondo:kondo/all` alias in `deps.edn`, which lints all source and test paths across the monorepo (core, enterprise, all driver modules, build tooling).

**What it catches**: unused vars, unresolved symbols, wrong arity, type mismatches, redundant expressions, Metabase-specific patterns (via custom hooks in `.clj-kondo/hooks/`).

**Configuration**: `.clj-kondo/config.edn` — already extensively configured. The Nix wrapper doesn't add any additional configuration.

**Version**: Pinned in `deps.edn` (currently 2025.10.23), not in nixpkgs. This ensures the same version runs locally, in CI, and via the Nix target.

## Eastwood

[Eastwood](https://github.com/jonase/eastwood) is a Clojure lint tool that loads and analyzes namespaces at a deeper level than kondo — it actually compiles the code and inspects the resulting forms.

```bash
nix run .#check-eastwood
```

This wraps the existing `:eastwood` alias in `deps.edn`, which is configured in `deps.edn` with:
- **Source paths**: All production source paths (core, enterprise, all driver modules)
- **Excluded linters**: `:deprecations` (in-progress cleanup), `:implicit-dependencies` (Potemkin false positives), `:unused-ret-vals` (too many false positives), `:wrong-arity` and `:suspicious-expression` (kondo handles these)
- **Excluded namespaces**: `metabase.analytics.snowplow` (dynamic okhttp3 dependency)

**What it catches**: Reflection warnings, incorrect function usage, suspicious test assertions, unused private vars, constant test expressions.

**Note**: Eastwood loads all namespaces into a JVM, so it's slower than kondo and may fail if there are compilation errors. Run `check-kondo` first to catch syntax issues.

## kibit

[kibit](https://github.com/clj-commons/kibit) suggests idiomatic Clojure rewrites. It's a style tool — all findings are suggestions, not errors.

```bash
# Scan default paths (src, enterprise/backend/src, modules/drivers/clickhouse/src)
nix run .#check-kibit

# Scan specific paths
nix run .#check-kibit -- --paths src enterprise/backend/src
```

**What it suggests**: `(if x true false)` -> `(boolean x)`, `(when (not x) ...)` -> `(when-not x ...)`, `(not (= x y))` -> `(not= x y)`, and similar idiomatic transformations.

kibit is invoked via inline `-Sdeps` (no deps.edn alias required). The version (0.1.11) is pinned in `nix/static-analysis/kibit.nix`.

## nvd-clojure (CVE Scanning)

[nvd-clojure](https://github.com/rm-hull/nvd-clojure) checks all Maven dependencies in the project's classpath against the [National Vulnerability Database](https://nvd.nist.gov/) (NVD).

```bash
nix run .#check-nvd
```

**Requires network access** — it downloads the NVD vulnerability feed on each run. This is why it's a `nix run` target rather than a `nix build` check (Nix builds run in a network-isolated sandbox).

On first run, nvd-clojure installs itself as a Clojure tool (via `clojure -Ttools install`). Subsequent runs skip this step.

**What it reports**: CVEs with severity levels (CRITICAL, HIGH, MEDIUM, LOW) for every transitive Maven dependency. This covers all Java libraries bundled in the uberjar — JDBC drivers, HTTP clients, XML parsers, crypto libraries, etc.

**Output**: An HTML report is generated in the project directory with full CVE details, affected versions, and links to advisories.

**Recommended frequency**: Run before releases and after dependency upgrades. High-severity findings on libraries Metabase actually uses (vs. transitive deps pulled in but never called) should be investigated.

## Combined Runner

```bash
nix run .#check-all-static
```

Runs all five analyzers sequentially in this order:
1. **kondo** — fast, catches syntax/lint issues that would block later tools
2. **eastwood** — deeper analysis, benefits from kondo passing first
3. **kibit** — style suggestions
4. **spotbugs** — bytecode analysis (slowest, runs after Clojure linters)
5. **nvd** — CVE scan (requires network, runs last)

Each tool runs independently — a failure in one doesn't skip the others. The combined runner reports a summary at the end:

```
========================================
  Summary (342 s)
========================================
  PASSED: kondo eastwood kibit
  FAILED: spotbugs nvd
```

Exit code is 0 only if all tools pass.

## Adding a New Analyzer

1. Create `nix/static-analysis/<tool>.nix` following the `writeShellApplication` pattern used by existing analyzers
2. Import it in `nix/static-analysis/default.nix` and add it to the attribute set
3. Add a `run_check` line to the `all` runner in `default.nix`
4. Wire the new attribute into `flake.nix` under the packages block
5. Run `nix flake show` to verify evaluation
6. Document the tool in this file

The simplest reference is `kondo.nix` (thin wrapper around an existing alias). For tools that need binary downloads, see `spotbugs.nix` (self-packaged via `fetchurl`).

## Module Structure

```
nix/static-analysis/
  default.nix              # Entry point — imports all, exposes attribute set + combined runner
  spotbugs.nix             # SpotBugs + FindSecBugs (self-packaged via fetchurl)
  nvd-clojure.nix          # CVE dependency scanning
  kibit.nix                # Idiomatic Clojure suggestions
  kondo.nix                # clj-kondo wrapper (uses existing deps.edn alias)
  eastwood.nix             # Eastwood wrapper (uses existing deps.edn alias)

config/static-analysis/
  spotbugs-exclude.xml     # False-positive suppressions for Clojure AOT bytecode
```

All Nix files live under `nix/static-analysis/`. The SpotBugs exclusion filter lives under `config/static-analysis/` since it's configuration rather than build logic, and may be useful independently of Nix (e.g., if someone runs SpotBugs manually or via a Gradle plugin).
