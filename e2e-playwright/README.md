# Playwright e2e spike

A spike port of the Cypress e2e suite to Playwright. First target: the navbar
spec (`e2e/test/scenarios/navigation/navbar.cy.spec.js` →
`tests/navbar.spec.ts`).

It runs against the exact same backend and state machinery as the Cypress
suite — the `/api/testing/snapshot|restore` endpoints, the `.sql` snapshots in
`e2e/snapshots/`, and the cached login sessions in
`e2e/support/cypress_sample_instance_data.json`. Nothing backend-side changes.

## Prerequisites

Same as for local Cypress runs:

1. Snapshots generated (they are, if you've run `bun run test-cypress`
   recently — check `e2e/snapshots/*.sql` exists alongside
   `e2e/support/cypress_sample_instance_data.json`).
2. A backend on port 4000, started the way the Cypress runner starts it:

   ```bash
   node e2e/runner/start-backend.js          # from source
   JAR_PATH=target/uberjar/metabase.jar node e2e/runner/start-backend.js  # from jar
   ```

3. When running from source (which uses `--hot`), the frontend hot server must
   also be up — index.html points its bundles at `localhost:8080`:

   ```bash
   bun run build-hot:js
   ```

   (Not needed when running from a jar — it serves static bundles.)

## Run

```bash
cd e2e-playwright
bun install
bunx playwright install chromium
bun run test               # or: bun run test:ui / test:headed
```

EE tests (token activation, library) skip automatically unless
`MB_PRO_SELF_HOSTED_TOKEN` (or `CYPRESS_MB_PRO_SELF_HOSTED_TOKEN`) is set and
the backend is EE.

## CI

`.github/workflows/e2e-playwright.yml` runs the suite against the EE uberjar
(same artifact pipeline as `e2e-test.yml`): fetch jar → start backend →
generate snapshots (still a Cypress run, `-@external` so no QA-DB containers)
→ `bunx playwright test` with junit/html reporters and failure artifacts.
Triggers: `workflow_dispatch` + PRs touching `e2e-playwright/**`.
Non-blocking. Next simplification: port `default.cy.snap.js` (~320 lines of
almost pure API calls) to a plain Node script, which drops the
prepare-cypress and CLJS steps from the workflow entirely.

## Layout

- `support/sample-data.ts` — reads the shared generated JSON data files
- `support/api.ts` — cy.request-equivalent client (restore, factories, settings)
- `support/fixtures.ts` — the `mb` fixture: cookie-injected auth mirroring the
  Cypress login cache; API calls run as the signed-in user
- `support/ui.ts` — ports of the `H` UI helpers the spec needs

## Results

Ten specs ported (61 tests). The first two established the harness:

- `navbar.spec.ts` (13 tests incl. 3 EE) — port of the navigation navbar spec
- `dashboard-filters-number-source.spec.ts` (4 tests) — port of the
  dashboard-filter spec, exercising the intercept/wait-alias pattern and the
  dashboard-editing helper suite

### Batch 2: eight diverse specs, port-cost data

Chosen to hit the hard Cypress→Playwright areas. Six ported by parallel
agents, two inline; each needed at most ONE human-loop fix before going
green:

| Spec | Cy lines | Tests | Stress area | Fixes needed |
|---|---|---|---|---|
| internal-analytics | 30 | 1 | cy.window / intercept body | 0 — green first run |
| scalar | 58 | 1 | echarts / color asserts | 0 — green first run |
| trendline | 100 | 3 | echarts trend lines | 0 — green first run |
| native-suggestions | 108 | 7 | CodeMirror autocomplete | 0 — green first run |
| dashboard-viz-options | 121 | 4 | dnd-kit drag, viz settings | 1 (drag → target-based) |
| permissions-baseline | 60 | 6 | sandboxed/none users | 1 (first-match semantics) |
| public-question | 281 | 7 | public links, signed-out ctx | 0 port bugs (2 upstream, see below) |
| downloads | 562 | 15 | real file downloads + xlsx | 1 (pivot export endpoint) |

### Batch 3: five QB-heavy specs

Shared notebook helpers (`support/notebook.ts`) were ported first, then four
agents + one inline port:

| Spec | Cy lines | Tests | Fixes needed |
|---|---|---|---|
| nested | 253 | 4 | 1 (strict-mode duplicate → .first()) |
| revision-history | 217 | 12+2 skip | 1 (post-save wait: no dashboard GET fires) |
| models-query-editor | 247 | 6 | 1 (discard refetch can use /api/dataset) |
| joins | 362 | 7 | 2 (notebook-visit readiness; search retype) |
| metrics-question | 238 | 9 | 2 (hover-only ellipsis; search-index wait) |

**Systemic find**: `restore()`'s async search-index rebuild can be dropped
entirely when restores come back-to-back (every test restores!), leaving a
dead index — the FE then renders permanent empty search states (mini-picker
"No search results", browse pages "Search Index not found"). The harness now
polls `/api/search` after every restore and escalates to
`POST /api/search/force-reindex` if it stalls (see `MetabaseHarness.restore`).
Healthy restores pay ~0ms. This same mechanism plausibly explains a class of
search-related flakes in Cypress CI.

Key findings:

- **~1,300 Cypress lines ported in one session** with 4 agents in parallel;
  every needed fix was surfaced directly by strict mode or a timeout on the
  first run — nothing silently wrong was found later.
- **Port-fidelity check**: 2 public-question tests fail — and the Cypress
  original fails the exact same 2 against the same backend (upstream
  dimension-template-tag parameters regression). Marked `test.fixme` with
  comments. Identical failure profiles are strong evidence of faithful ports.
- **Playwright made three specs *stronger***: downloads actually downloads
  and parses files (Cypress stubbed the responses away); CodeMirror typing
  needs no cypress-real-events equivalent; dnd-kit drags use real mouse input
  instead of synthetic-event choreography.
- **Consolidation debt**: parallel agents couldn't touch shared files, so a
  few helpers are duplicated across support modules (icon, adhocQuestionHash,
  signInWithCachedSession, createNativeQuestion). Fold into shared modules
  before the next batch.
- The local `--hot` dev-stack stall (below) now shows up as ~3 flaky
  editor-navigation tests per full-suite run; all pass in isolation. CI
  (uberjar + static assets) is the arbiter for real stability.

### Cypress vs Playwright timing (same backend, warm 2nd run, video/trace off)

| Spec | Cypress | Playwright |
|---|---|---|
| navbar (13 small tests) | **19.4s** | 21.8s |
| dashboard-filters (4 heavy tests) | 21.7s | **14.5s** |

At `workers: 1` the frameworks are roughly comparable: Playwright is ~33%
faster on interaction-heavy tests but slightly slower on many-tiny-test specs
(fresh browser context per test vs Cypress page reuse). Parallelism is the
real lever — see the per-worker backend experiment below.

### Per-worker backend experiment (PW_PER_WORKER_BACKEND=1)

Each worker boots its own Metabase JVM (port 4100+slot) with its own H2 app
DB, plugins dir, and sample-database copy. Result, all 17 tests:

|  | wall clock | test phase |
|---|---|---|
| 1 worker, shared backend | 36.6s | 36.6s |
| 3 workers, per-worker backends | 83.2s | **~13s** (+67s parallel boot) |

Test execution scales near-linearly (~2.8x with 3 workers). The from-source
boot (67s warm, ~2.3GB RSS per JVM steady-state) dominates a run this small;
it's paid once per run regardless of suite size, so it amortizes on real
suites — and a prebuilt-jar boot (the CI mode) should be substantially
cheaper.

What it took to make parallel backends work (all handled in
`support/worker-backend.ts` / `fixtures.ts`):

1. **Sample-DB file lock**: snapshots pin database 1 to the shared
   `e2e/tmp` H2 file; only one extra JVM can open it. Fix: per-worker copy +
   re-point database 1 after every restore.
2. **Plugins-dir race**: concurrent boots corrupt the shared cwd-relative
   `plugins/` extraction → per-worker `MB_PLUGINS_DIR`.
3. **nREPL port clash**: dev-mode backends all bind 50605 → per-worker
   `NREPL_PORT`.
4. **Cold-backend first query fails** → warmup (restore + repoint + retried
   query) before the worker starts testing.
5. **Worker replacement**: Playwright replaces a worker after any test
   failure; key backends to `parallelIndex` (stable slot) and leave them
   running so replacements reuse instead of re-booting (~70s saved each);
   global teardown reaps them.

## Spike notes / gotchas found so far

- **Text matching semantics** (biggest porting-bug source so far):
  testing-library's `findByText("Edit")`/`findByRole(r, { name })` match
  **exactly**; Playwright's `getByText`/`getByRole` name matching is
  **case-insensitive substring**. Port rule: string selectors from
  `findByText`/`findByRole` get `{ exact: true }`. Same for `cy.contains`,
  which is case-sensitive ("Total" ≠ "Subtotal") where Playwright isn't.
  Playwright strict mode catches every miss loudly instead of clicking the
  wrong element.
- **Env/tokens**: premium tokens come from the gitignored repo-root
  `cypress.env.json` (auto-loaded by Cypress; `support/env.ts` reads the same
  file). The repo-root `.env` copies are stale — don't use them.
- **CSP**: Cypress sets `chromeWebSecurity: false`; without its Playwright
  equivalent (`bypassCSP: true`) the backend's CSP blocks the hot-reload
  bundles from `localhost:8080` and the app renders an empty page.
- **Intermittent local-dev stall (unresolved)**: roughly 1 in 5 full runs, a
  click that navigates into an editor (SQL editor, new question) wedges the
  page; the test times out at 90s and — worse — the browser-context teardown
  can then hang for many minutes. Seen only against the local dev stack
  (`--hot` backend + rspack serve); per-test durations are 1-6s otherwise.
  Not reproduced against a per-worker (also `--hot`) backend, and CI-mode
  (uberjar + static assets) doesn't share this stack. Needs a proper look
  before trusting local wall-clock numbers taken while the machine is busy.
- **Never run `bunx playwright test`/`bunx tsc` from the repo root** — with no
  local config, Playwright's default testMatch collects every `*.cy.spec.ts`
  in the monorepo and OOMs transpiling the frontend; root `tsc` does the same.
  Always run from `e2e-playwright/`.
- Sidebar sections use a literal `role="section"` (not a valid ARIA role).
  Cypress testing-library matched it; Playwright's `getByRole` won't. Ported
  as an attribute selector (`sidebarSection()` in `support/ui.ts`).
- Waits must be registered *before* the navigation that triggers them
  (`visitQuestion` in `support/ui.ts` shows the pattern).
- The cookie-injected login cache works exactly as in Cypress — no login
  requests needed; sessions come from the snapshot's `core_session` table.
- `workers: 1` for now: `restore()` resets the whole app DB, so tests can't
  interleave across workers against one backend. Per-worker backends are the
  follow-up experiment.
