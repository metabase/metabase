# dashboard-filters-reproductions-1 — port findings

Source: `e2e/test/scenarios/filters-reproductions/dashboard-filters-reproductions-1.cy.spec.js`
(2,531 lines, 40 tests) → `tests/dashboard-filters-reproductions-1.spec.ts`.
New helpers: `support/filters-repros.ts` only.

Verified on slot 5 (`PW_SLOT_OFFSET=5`, per-worker source-mode backend on
:4105, this branch): **33 passed / 7 skipped / 0 failed**, and clean under
`--repeat-each=2` (66 passed / 14 skipped). The 7 skipped are 6 `test.fixme`
(below) + `metabase#12985-2`, which carries `{ tags: "@skip" }` upstream.

## Pre-existing failures reproduced identically by Cypress (6 → test.fixme)

The headline result. I ran the **original Cypress spec against the same
slot-5 backend** (`MB_JETTY_PORT=4105 bunx cypress run --spec …`, so port 4000
was never touched): **33 passing / 7 failing**. Cypress's failures are the
same set as the port's, failing at the same assertions:

| test | Cypress error (same backend) | port error |
| --- | --- | --- |
| `metabase#12720` | `expected '' to include '2029-01-01~'` | `Expected substring: "2029-01-01~" / Received: ""` |
| `metabase#47172` | same param assertion, `+ expected - actual` | `Expected "?filter=2029-01-01~" / Received ""` |
| `metabase#21528` | `Expected to find content: 'Rustic Paper Wallet - 1' within <div…Popover…> but never did` | same content never visible in popover |
| `metabase#25374-1` | `Unable to find an element by: [data-testid="table-header"]` | `waiting for getByTestId('table-header')` |
| `metabase#25374-3` | `Expected to find element: [data-testid=cell-data], but never found it` | `getByTestId('cell-data')` filtered on `COUNT(*)` not found |
| `metabase#25374-4` | `[data-testid="table-header"]` (via `tableHeaderColumn`) | `getByTestId('table-header')` text `COUNT(*)` not found |

Common shape: a dashcard **title drill-through does not carry the dashboard
filter's value** into the question (12720/47172/25374-1/-3/-4), plus FK-remapped
field values missing from a parameter dropdown (21528). `25374-2`, which only
reloads the dashboard rather than drilling, passes.

**Scoping — what is and isn't established:**
- Established: these are **not port defects**. The unmodified Cypress spec
  fails identically on the same backend, at the same assertions.
- Ruled out: stale-snapshot drift (the PORTING.md gotcha whose signature is
  "Cypress fails identically"). `e2e/snapshots/default.sql` (Jul 17 20:59) is
  newer than the latest `resources/migrations/` commit (Jul 15).
- **Not established**: the root cause, and whether these fail in CI (jar
  backend + static assets) or on master. Both harnesses here share one
  source-mode `--hot` backend and one rspack dev server, so a shared
  environmental cause is not excluded. Only this branch/backend was tested.
- Worth a follow-up: if CI's Cypress leg is green on this spec while both
  harnesses fail locally, the delta is environmental (hot FE bundle / dev
  backend); if CI is also red, it's a product regression that predates the
  port.

## Migration dividends

1. **Upstream assertion that silently asserts nothing.** `25374-1` calls
   `H.tableInteractiveHeader("COUNT(*)")`, but that helper
   (`e2e-ui-elements-helpers.js:503`) **takes no arguments** — the string is
   discarded and only the header's existence is checked. My first port
   "helpfully" asserted the text, which is stricter than the original. Kept
   faithful, with a comment; the same spec's `25374-4` uses
   `H.tableHeaderColumn("COUNT(*)")`, which *does* assert text. Cheap grep for
   other call sites passing dead arguments to that helper.
2. **`cy.wait` backlog-consumption made visible.** `25374-3/-4` "wait" on
   `@dashcardQuery` after clicking *Clear*, but clearing to an empty value
   fires no dashcard query — the waits pass only because Cypress consumes an
   already-recorded response from the alias's backlog. A faithful
   `waitForResponse` hangs for 30s. Ported to retried assertions, with the
   reasoning recorded inline. (Known gotcha in PORTING.md; this spec is a
   textbook instance.)
3. **Upstream intercept typo, inert.** The `25374` beforeEach registers
   `cy.intercept("POST", "/api/dashboard/*/dashcard/*/card//*/query")` — note
   the doubled slash, which cannot match a real dashcard URL. The port matches
   the real path.

## New gotchas (candidates for PORTING.md)

1. **`enable_embedding` cannot ride along on `POST /api/dashboard`.** It needs
   a follow-up PUT — exactly what `H.createDashboard` does (POST, then PUT for
   `enable_embedding`/`auto_apply_filters`/`embedding_params`). Collapsing that
   into one POST is silently ignored and the embed page renders *"Embedding is
   not enabled for this object"*. **One helper bug, 4 test failures** (all 3
   `29347/29346 › embedded dashboards` + `42829` embedded). When porting an
   API helper, port its *shape*, not just its payload.
2. **`findByDisplayValue` must match `textarea`/`select`, not just `input`.**
   The dashboard title (EditableText) renders a `<textarea>`, so
   `dashboard-cards.ts inputWithValue` (input-only) misses it. Added
   `findByDisplayValue` in `filters-repros.ts`; worth folding into the shared
   module at consolidation.
3. **Cypress `not.be.visible` catches scroll-clipping; Playwright's
   `toBeVisible()` does not.** `26230` scrolls `<main>` to the bottom and
   asserts the title is hidden. A viewport-intersection check is *not* the
   equivalent either — the element sits inside a scrolling container that
   itself is on-screen. Added `isClippedByScrollContainer` (element rect vs
   *container* rect).
4. **"Default value" labels a wrapper `<div>`, and the input inside has no
   accessible name.** This is a sharper variant of the known
   getByLabel-resolves-the-wrapper gotcha: `getByRole("textbox", { name:
   "Default value" })` — the documented fix — matches **nothing** here, because
   `ParameterSettings.tsx` puts `aria-labelledby="default-value-label"` on a
   div wrapping `ParameterValueWidget`. Correct target:
   `getByLabel("Default value").locator("input")`. Typing at the div is a
   silent no-op that leaves the dashboard un-dirtied, so the failure surfaces
   far away, inside `saveDashboard`, as a 30s `waitForResponse` timeout on a
   PUT that never fires.
5. **Virtualized table cells render once per quadrant.** `getByText(value,
   { exact: true })` on result cells is a strict-mode violation (two matches:
   `center-center-quadrant` and a sibling). `.first()`, per port rule 3.
   Cypress's `findByText` tolerates it here.

## Environment note (cost me the first run)

The slot-5 backend was serving `resources/frontend_client/index.html` from
stencil's **cached template** — the hashed production asset paths from an
earlier build — so every page 404'd its JS and rendered blank. This is *not*
the known "rspack dropped assets" case: `:8080` was serving
`app-main.hot.bundle.js` fine, and the on-disk `index.html` correctly pointed
at `:8080`. The backend had cached the template at boot, from before the hot
build rewrote it. Fixed without restarting the JVM by invalidating the cache
over the slot's nREPL:

```clojure
(stencil.loader/invalidate-cache-entry "frontend_client/index.html")
```

Worth knowing before diagnosing a blank UI as a port bug — a known-green spec
(`dashboard-filters-number-source`) failed identically, which is the tell.
