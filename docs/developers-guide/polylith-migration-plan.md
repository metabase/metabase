# Polylith Migration Plan for Metabase

## Executive Summary

This plan describes how to introduce [Polylith](https://polylith.gitbook.io/polylith) as the software architecture for the Metabase repository. Metabase already has a homegrown module boundary system (176 modules enforced via clj-kondo), so this migration builds on existing work rather than starting from scratch.

The primary goals are:
1. **Classpath-level module isolation** (today's boundaries are linter-enforced only)
2. **Incremental testing in CI** (only test changed bricks and their dependents)
3. **Standardized tooling** (`poly info`, `poly deps`, `poly test` replace custom dev tooling)

## Current State

### What We Have

- **176 backend modules** defined in `.clj-kondo/config/modules/config.edn`
- Each module has: `:api` (public interfaces), `:uses` (allowed deps), `:friends` (deep access), `:model-exports`/`:model-imports`
- Module boundary enforcement via clj-kondo lint rules
- Custom tooling in `dev.deps-graph` for dependency analysis
- **18 database drivers** as separate `:local/root` modules in `modules/drivers/`
- Enterprise code as a separate source path (`enterprise/backend/src`)
- Backend tests partitioned into 4-5 parallel jobs in CI

### How Modules Map to Polylith Concepts

| Metabase Today | Polylith Equivalent |
|---|---|
| Module (e.g. `query-processor`) | Component |
| Module `:api` namespaces | Interface namespace |
| Module `:uses` set | Component dependency declarations |
| Module `:friends` set | No direct equivalent (requires architectural change) |
| Driver module | Component |
| `core`, `cmd`, `api-routes` modules | Base |
| Enterprise overlay (`defenterprise`) | Swappable component implementation |
| `dev` alias + all source paths | Development project |
| EE/OSS uberjar build | Polylith project |

## Migration Phases

### Phase 0: Workspace Scaffolding

**Goal**: Get `poly` running against the repo without moving any code.

**Changes**:

1. Add `workspace.edn` at the repo root:
   ```clojure
   {:top-namespace "metabase"
    :interface-ns "api"
    :vcs {:name "git" :auto-add false}
    :projects {"development" {:alias "dev"}}}
   ```

2. Add `:poly` alias to root `deps.edn`:
   ```clojure
   :poly {:extra-deps {polylith/clj-poly {:mvn/version "0.3.32"}}
          :main-opts  ["-m" "polylith.clj.core.poly-cli.core"]}
   ```

3. Run `clj -M:poly info` and `clj -M:poly check` to baseline.

4. Add a `poly-check` CI job (see [CI Integration](#ci-integration) below).

**Risk**: None. This is additive only.

### Phase 1: Drivers as Polylith Components

**Goal**: Migrate the 18 drivers, which are already separate modules with their own `deps.edn`.

**Why start here**: Drivers are the most isolated code in the repo. Each has its own source tree, test tree, and dependency file. The migration is mostly a directory move.

**Steps**:

1. Move `modules/drivers/<driver>/` to `components/<driver>/`
2. Ensure each driver's `deps.edn` follows Polylith conventions:
   ```clojure
   {:paths ["src" "resources/<driver>"]
    :deps {<driver-specific-deps>}
    :aliases {:test {:paths ["test"]
                     :extra-deps {<test-deps>}}}}
   ```
3. Create interface namespace for each driver (most already register via `defmethod` on `metabase.driver` multimethods, so the interface is the multimethod protocol itself)
4. Update root `deps.edn` `:drivers` alias to reference new paths
5. Validate with `clj -M:poly check`

**Estimated scope**: 18 components, primarily directory restructuring.

### Phase 2: Leaf Modules as Components

**Goal**: Extract modules with few dependencies, working outward from the leaves of the dependency graph.

**Good first candidates** (small `:uses` sets):
- `util` — foundational, no module dependencies
- `config` — minimal dependencies
- `classloader`, `connection-pool`, `plugins`
- `batch-processing`, `bug-reporting`
- `appearance`, `bookmarks`

**For each module**:

1. Create `components/<module>/` with:
   - `deps.edn` — brick-level dependencies
   - `src/metabase/<module>/` — existing source files (moved)
   - `test/metabase/<module>/` — existing test files (moved)
   - `resources/<module>/` — any module-specific resources
2. Designate interface namespace from existing `:api` config
3. Add `:local/root` entry in root `deps.edn`
4. Run `poly check` to validate dependency rules

### Phase 3: Core Modules as Components

**Goal**: Migrate the large, heavily-depended-upon modules.

**Order** (respecting dependency graph):
1. `app-db`, `settings`, `driver` (infrastructure layer)
2. `models`, `permissions`, `collections` (data model layer)
3. `query-processor` (may need sub-decomposition into multiple components)
4. `sync`, `analyze`, `search` (data pipeline layer)

**Special considerations**:
- `query-processor` is very large and may benefit from being split into `qp-core`, `qp-middleware`, `qp-compilation` components
- Circular dependencies between modules will surface at this phase and must be resolved by extracting shared abstractions

### Phase 4: Bases

**Goal**: Convert entry points to Polylith bases.

| Current Module | Polylith Base |
|---|---|
| `core` | `metabase-server` — main server entry point |
| `cmd` | `metabase-cli` — CLI commands (migrate, import, etc.) |
| `api-routes` | Could remain part of `metabase-server` base |

Bases have no interface and delegate to component interfaces.

### Phase 5: Enterprise as Swappable Components

**Goal**: Model the EE/OSS distinction using Polylith's component swappability.

For each enterprise module (e.g., `enterprise/sandbox`):
1. Define an interface (shared between OSS and EE implementations)
2. OSS component provides default/no-op implementation
3. EE component provides full implementation
4. Projects select which implementation to include

The existing `defenterprise` macro may continue to work within this model, with the EE component on the classpath or not.

### Phase 6: Projects

**Goal**: Define deployable artifacts as Polylith projects.

| Project | Included Bricks |
|---|---|
| `metabase-oss` | All OSS components + `metabase-server` base |
| `metabase-ee` | All OSS + EE components + `metabase-server` base |
| `metabase-cli` | Core components + `metabase-cli` base |
| `driver-test-<driver>` | Core + specific driver (for CI parallelization) |

## CI Integration

### New Workflow: `poly-check.yml`

Add early in Phase 0 as a fast validation gate.

```yaml
name: Polylith Check

on:
  workflow_call:
    inputs:
      skip:
        type: boolean
        default: false

jobs:
  poly-check:
    if: ${{ !inputs.skip }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          # poly needs git history to detect changes
          fetch-depth: 0
      - name: Prepare back-end environment
        uses: ./.github/actions/prepare-backend
      - name: Polylith check
        run: clojure -M:poly check
      - name: Polylith info
        run: clojure -M:poly info
```

Add to `run-tests.yml`:
```yaml
  poly-check:
    needs: files-changed
    uses: ./.github/workflows/poly-check.yml
    secrets: inherit
    with:
      skip: ${{ needs.files-changed.outputs.backend_all != 'true' }}
```

### Phase 1+: Incremental Backend Testing

Once bricks are established, replace the static test partitioning in `backend.yml` with Polylith's change-aware testing.

**Current approach** (backend.yml):
- Tests are split into fixed partitions (EE tests, OSS part 1, OSS part 2)
- All backend tests run when any backend file changes
- `file-paths.yaml` only distinguishes "backend changed" vs "frontend changed"

**Polylith approach**:

1. **New step: Detect changed bricks**
   ```yaml
   - name: Detect changed bricks
     id: poly-diff
     run: |
       # Get changed/affected projects since the merge base
       CHANGED=$(clojure -M:poly ws get:changes:changed-or-affected-projects since:previous-release)
       echo "changed-projects=$CHANGED" >> $GITHUB_OUTPUT

       # Get list of changed bricks for targeted testing
       BRICKS=$(clojure -M:poly ws get:changes:changed-or-affected-bricks since:previous-release)
       echo "changed-bricks=$BRICKS" >> $GITHUB_OUTPUT
   ```

2. **Conditional test execution**: Only run tests for changed bricks
   ```yaml
   - name: Run incremental tests
     if: steps.poly-diff.outputs.changed-bricks != ''
     run: clojure -M:poly test since:previous-release
   ```

3. **Keep full test suite on master**: `poly test :all` on pushes to master/release branches.

**Workflow changes to `backend.yml`**:

```yaml
jobs:
  be-tests-incremental:
    if: ${{ !inputs.skip && github.event_name == 'pull_request' }}
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Prepare environments
        uses: ./.github/actions/prepare-backend
      - name: Run changed brick tests
        run: clojure -M:poly test since:stable

  be-tests-full:
    if: ${{ !inputs.skip && github.event_name == 'push' }}
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v4
      - name: Prepare environments
        uses: ./.github/actions/prepare-backend
      - name: Run all tests
        run: clojure -M:poly test :all
```

### Phase 2+: Replace `file-paths.yaml` Path Detection

The current `files-changed` job in `run-tests.yml` uses `dorny/paths-filter` with coarse-grained path patterns (`src/**`, `enterprise/**`). Polylith's git-based change detection is more precise:

**Current** (`file-paths.yaml`):
```yaml
backend_all:
  - *default
  - *shared_sources
  - *backend_sources
  - *backend_ci
```

**With Polylith**: Replace the `backend_all` boolean with a list of affected bricks/projects. This allows:
- Skip backend tests entirely if only frontend bricks changed
- Run only driver tests if only a driver component changed
- Run only EE tests if only enterprise components changed

**Updated `run-tests.yml` structure**:
```yaml
jobs:
  poly-changes:
    name: Detect changes via Polylith
    runs-on: ubuntu-latest
    outputs:
      backend-changed: ${{ steps.poly.outputs.backend-changed }}
      affected-projects: ${{ steps.poly.outputs.affected-projects }}
      affected-bricks: ${{ steps.poly.outputs.affected-bricks }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Prepare back-end environment
        uses: ./.github/actions/prepare-backend
      - name: Polylith change detection
        id: poly
        run: |
          BRICKS=$(clojure -M:poly ws get:changes:changed-or-affected-bricks since:stable)
          PROJECTS=$(clojure -M:poly ws get:changes:changed-or-affected-projects since:stable)
          echo "affected-bricks=$BRICKS" >> $GITHUB_OUTPUT
          echo "affected-projects=$PROJECTS" >> $GITHUB_OUTPUT
          if [ -n "$BRICKS" ]; then
            echo "backend-changed=true" >> $GITHUB_OUTPUT
          else
            echo "backend-changed=false" >> $GITHUB_OUTPUT
          fi

  backend-tests:
    needs: [poly-changes]
    if: ${{ needs.poly-changes.outputs.backend-changed == 'true' }}
    uses: ./.github/workflows/backend.yml
    secrets: inherit
```

### Phase 3+: Per-Project CI Matrix

Once Polylith projects are defined, generate the CI test matrix dynamically from affected projects:

```yaml
  determine-matrix:
    needs: [poly-changes]
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.matrix.outputs.matrix }}
    steps:
      - name: Build test matrix from affected projects
        id: matrix
        run: |
          # poly ws returns JSON-compatible data
          PROJECTS='${{ needs.poly-changes.outputs.affected-projects }}'
          # Convert to GitHub Actions matrix format
          MATRIX=$(echo "$PROJECTS" | jq -Rc 'split(" ") | {project: .}')
          echo "matrix=$MATRIX" >> $GITHUB_OUTPUT

  test-projects:
    needs: [determine-matrix]
    if: ${{ needs.determine-matrix.outputs.matrix != '{"project":[]}' }}
    strategy:
      matrix: ${{ fromJson(needs.determine-matrix.outputs.matrix) }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Test project ${{ matrix.project }}
        run: clojure -M:poly test project:${{ matrix.project }}
```

### Driver Test Optimization

The current `drivers.yml` runs all driver tests when `backend_all` is true. With Polylith, each driver is a component, so:

- If only the Postgres driver changed, only Postgres driver tests run
- If core query-processor changed, all driver tests run (they depend on qp)
- `poly` computes this transitively via brick dependencies

This replaces the current all-or-nothing driver test triggering.

### Tagging Stable Points

Polylith uses git tags to mark "stable" points (typically after a successful CI run on master). Add a post-merge step:

```yaml
  mark-stable:
    needs: [backend-tests, frontend-tests, e2e-tests, driver-tests]
    if: ${{ github.ref == 'refs/heads/master' && !failure() && !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Tag stable point
        run: |
          git tag -f stable-$(date +%Y%m%d%H%M%S)
          git push origin --tags --force
```

This allows `poly test since:stable` on PRs to only test what changed since the last green master build.

## Considerations and Risks

### The `:friends` Problem

Polylith has no concept of "friend" modules that can reach into another module's internals. Metabase uses this for enterprise extensions (e.g., `enterprise/search` is a friend of `search`). Options:
- Widen the interface to expose what friends need
- Use Polylith's "same interface, different implementation" pattern
- Accept that some modules need broader interfaces than ideal

### 176 Modules May Be Too Granular

Polylith works best with 10-50 components. Some Metabase modules could be grouped:
- `collections` + `collections-rest` → one component
- `queries` + `queries-rest` → one component
- `query-processor` sub-modules → one component (or 2-3 at most)

### Migration Is Incremental

Polylith ignores non-Polylith code in the repo. Unmigrated modules continue working as today. There is no big-bang cutover. Each phase can be validated independently.

### Frontend

Polylith is Clojure-centric. The frontend TypeScript code would not benefit from `poly` tooling. The frontend change detection in CI should continue using `dorny/paths-filter` or a similar file-path-based approach. Polylith only replaces the backend change detection and test orchestration.

### Build System

Polylith does not include build commands. The existing `tools.build` / `bin/build` / `bin/mage` system continues to handle uberjar creation, driver compilation, etc. Projects in Polylith would reference the same build infrastructure.

## Success Metrics

- **CI time on PRs**: Measure reduction from incremental testing (target: 50%+ reduction for typical PRs)
- **Boundary violations**: Count of cross-module violations caught by `poly check` vs. clj-kondo (should be equivalent or better)
- **Developer experience**: `poly info` provides at-a-glance view of what changed and what needs testing
- **Build reliability**: Classpath isolation prevents accidental coupling that the linter might miss

## Timeline Estimate

| Phase | Scope | Dependencies |
|---|---|---|
| Phase 0 | Workspace scaffolding + CI check | None |
| Phase 1 | 18 drivers → components | Phase 0 |
| Phase 2 | ~20 leaf modules → components | Phase 0 |
| Phase 3 | ~30 core modules → components | Phase 2 |
| Phase 4 | 2-3 bases | Phase 3 |
| Phase 5 | Enterprise overlay pattern | Phase 3 |
| Phase 6 | Deployable projects | Phase 4 + 5 |

Each phase is independently valuable and can be paused/resumed.
