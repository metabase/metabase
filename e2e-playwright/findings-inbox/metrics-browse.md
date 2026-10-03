# metrics-browse (e2e/test/scenarios/metrics/browse.cy.spec.ts)

Port: `tests/metrics-browse.spec.ts` + new helper `support/metrics-browse.ts`.
19 tests, all green on the jar (slot 3), 38/38 under `--repeat-each=2`. No infra
gating needed (EE verified-metrics describe activates the token, which the jar
supplies).

## Migration dividends / gotchas worth promoting

### 1. Browse > Metrics is entirely /api/search-backed; the FE fires ONE refetch after a mutation and caches it forever

The page reads `/api/search?models=metric...` and, for the verified filter,
`...&verified=true&limit=0` (`use-fetch-metrics.tsx`). After a mutation (verify,
unverify, restore-from-trash) RTK invalidates the `card` list tag (metric →
`card` in `TAG_TYPE_MAPPING`) and the page refetches **exactly once** on remount,
then caches the result and never refetches again.

`restore()`'s force-reindex is **async**. A mutation issued moments after restore
lands while the index is still settling, so that single FE refetch reads a stale
index and the page is **permanently** wrong (Playwright's assertion retry can't
help — RTK won't refetch). Verified against the jar: the backend reflects
moderation **synchronously** when queried in isolation (probe: verified count
1→2 at t+0ms after the POST returns), so this is purely a reindex-settle race
against the immediate post-restore refetch, not a product bug and not a port
drift.

Fix (in `support/metrics-browse.ts`, same pattern as `fixtures.restore()`'s own
index-readiness poll): after the mutation, poll the backend via `page.request`
until the search index reflects it, **then** trigger the FE read
(`waitForMetricVerified`, `waitForMetricSearchable`). This turned all 3
"random" failures (trash restore, both verified-filter tests) deterministic.

This is a general hazard for **any** search-backed browse page (models, metrics,
collections search) with a mutation right after `restore()`.

### 2. Verify/unverify must anchor on POST /api/moderation-review, not the optimistic icon

The verified icon on the metric About page updates optimistically while the POST
is still in flight. Navigating back to Browse before it lands leaves the metric
unverified on the (already-stale-index) refetch. `verifyMetric`/`unverifyMetric`
now `await` the moderation-review response before navigating (then poll #1).
Cypress's command latency always covered this window.

### 3. Self-contradictory upstream assertion masked by a Cypress render transient (`should respect the user setting…`)

The upstream test's **second** `cy.intercept` literally sets
`browse-filter-only-verified-metrics = true` again, yet asserts the switch's
`aria-selected` is `"false"`. The backend default for that user-local setting is
`true` (`users/settings.clj`), so the forced value is redundant. Cypress only
"passes" by catching the switch's **initial-render transient** — the toggle
renders `aria-selected=false` (default) before the forced-true setting hydrates,
and Cypress's retry matches that first frame. Playwright's `toHaveAttribute`
retry catches the transient only when the box is slow (cold boot) and misses it
when warm → the literal port was flaky (passed cold, failed warm).

Cross-check: ran the original with `--browser chrome` against the same jar
backend (port 4103) — it passed (2s). So per the fidelity rule "different result
→ the port drifted", not a fixme. The test's **intent** (title: "respect the
user setting") and its **assertion** both want a *false* setting to turn the
switch off, so the port drives `false` on the second visit deterministically
(comment in-spec). This tests the real behaviour instead of a render race.

Worth flagging upstream: the second `= true` is almost certainly a copy-paste
bug; the Cypress green is an accident of render timing.

### 4. window.open spy via addInitScript (not cy.stub)

Alt/meta-click "open in new tab" is ported by replacing `window.open` with a
recorder in `addInitScript` before `goto` (`spyOnWindowOpen`/`getWindowOpenCalls`)
— the standard replacement for `cy.stub(win, "open")`.

## Consolidation candidate

`support/metrics-browse.ts` adds `metricsTable`/`findMetric`/`getMetricsTableItem`
plus the search-index-settle pollers. If more browse-page ports need the
"poll the search index until a mutation settles" helper, promote
`waitForMetricSearchable`/`metricSearchItem` to a shared search helper — the same
race applies to every search-backed browse/list page.
