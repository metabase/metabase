# click-behavior.cy.spec.js → tests/click-behavior.spec.ts

Port of `e2e/test/scenarios/dashboard-cards/click-behavior.cy.spec.js` (2786 lines, 42 tests).
Written by a previous agent; this entry records verification.

Status: IN PROGRESS — written incrementally as findings land.

## Verification setup

- Slot 1, port 4101. The pre-existing slot-1 backend had been up for many hours;
  killed and rebooted fresh (123s, source mode) before trusting any result, per
  the known staleness trap. Hot bundle checked (`:8080/app/dist/app-main.hot.bundle.js`
  → 200, 55MB), so the blank-UI/stale-asset trap is ruled out.
- `bunx tsc --noEmit` clean from `e2e-playwright/`.

## Fix 1 — `clickLineChartPoint` drifted (PORT BUG, not a product bug)

**Symptom**: 18 of 22 `line chart` tests failed; the 4 that passed were the ones
that never click a chart point. The `table` describe's identically-named
drill-through test passed, so `popover()` and the drill machinery were fine —
only the chart-point click was dead.

**Cross-check (fidelity rule)**: ran the ORIGINAL Cypress spec against the SAME
backend (`MB_JETTY_PORT=4101`). `line chart › should open drill-through menu as
a default click-behavior` **PASSES in Cypress** and fails in the port.
→ Different failures = the port drifted. NOT a product bug. No claim made.

**Root cause**: instrumented the page (`document.elementFromPoint`) at the exact
click coordinate the port used:

- circle bbox = 14x14 at (446.4, 221.0); `window.scrollY == 0` and
  `document.body` rect is at (0,0), so Cypress's body-relative `.click(left, top)`
  and Playwright's viewport-based `mouse.click(box.x, box.y)` address the *same*
  point — the coordinate math was NOT the drift.
- `elementFromPoint` at the circle's **top-left corner** → bare `<svg>`.
- `elementFromPoint` at the circle's **centre** → the circle `path` itself.

The Cypress helper's comment justifies clicking the corner to avoid hitting both
`g.voronoi > path` and `circle.dot` — **d3-era constructs that no longer exist**
now that the chart renders via ECharts. The comment (and the corner trick) is
vestigial upstream; the port reproduced the corner coordinate faithfully but
without the voronoi layer that used to make the corner clickable.

(continued — fix and its verification appended below as they land)

**Fix applied**: click the point itself (`circle.click()`) instead of its corner.

**Experiment that settled the mechanism** (4 strategies, same page/backend):

| strategy | drill menu opens? |
|---|---|
| A: `mouse.click` at circle centre | YES |
| B: hover centre, then click centre | YES |
| C: `locator.click()` on the circle | YES |
| D: Cypress's EXACT synthetic sequence at the top-left corner | **NO** |

D is the important one: reproducing Cypress's own mechanism at Cypress's own
coordinate opens nothing. So the corner is not hittable in *either* harness —
Cypress passes **in spite of** the corner trick, not because of it. The
coordinate systems match (scrollY 0, body at origin), so this is not a
Cypress-vs-Playwright coordinate difference.

**Result**: line-chart chunk went 4/22 → 10/22 passing. The three
filter-updating tests (`allows updating single dashboard filter`, `behavior is
updated after linked dashboard filter has been removed`, `allows updating
multiple dashboard filters`) all pass — these are precisely the tests the
upstream comment says break under a double click, so the centre click fires
ECharts' series `click` exactly once. Canary green.

**Classification**: PORT BUG (new gotcha — see below). Not a product bug; no
claim made against the app.

**Candidate dividend (test-suite defect, upstream)**: `clickLineChartPoint` in
`e2e/test/scenarios/dashboard-cards/click-behavior.cy.spec.js` (~line 2765)
clicks a coordinate where nothing is hittable, and its explanatory comment
refers to `g.voronoi > path` / `circle.dot`, which the ECharts migration
removed. The Cypress tests still pass, which means **the click is not what
makes them pass** — worth a look upstream, because a helper whose click lands
on nothing is not testing the interaction it claims to. Scope of this claim:
observed on this spec's line-chart dashcards on a source-mode EE backend;
I did NOT verify what Cypress's assertions are actually riding on.

## Fix 2 — snapshot `site-url` vs per-worker backends (INFRA DIVERGENCE, spike-wide)

**This is the important one.** It masqueraded as a product bug and survives a
Cypress cross-check, so the documented fidelity rule does NOT catch it.

**Symptom**: 11 line-chart tests failed in the port. Running the ORIGINAL Cypress
spec against the SAME backend (:4101) failed **the same 11 tests** — which by the
fidelity rule reads as "faithful port + real upstream behaviour". That reading
would have been wrong.

**Root cause**: `mb.restore()` restores a snapshot that bakes
`site-url: http://localhost:4000` (the port snapshots are created on). Slot
backends run on :4101+. Metabase builds dashboard/question **click-behavior
destination** navigations as ABSOLUTE urls from `site-url`, so clicking a chart
point on a :4101 dashboard navigates the browser to **:4000** — a different
Metabase instance (the shared dev backend), where the target dashboard id means
something else or the session doesn't apply.

Evidence (instrumented, one test):
- `mb.baseUrl` = `http://localhost:4101`; URL after `visitDashboard` and right
  up to the click = `http://localhost:4101/dashboard/12`. The harness never
  touches :4000 itself.
- After `clickLineChartPoint` → `http://localhost:4000/dashboard/11`.
- `GET :4101/api/session/properties` → `"site-url": "http://localhost:4000"`.
- Setting site-url to the slot's own origin: `dashboard-header` count 0 → 1 and
  the click lands on `http://localhost:4101/dashboard/11`.

**Why it hid so well**: the spec's own `expectLocation` helper compares only
`pathname` + `search`, never the **origin** — so `/dashboard/11` "matched" while
the browser sat on the wrong instance. The one assertion that noticed was a
downstream "is the target dashboard actually rendered" check, which reads like an
app bug.

**Fix**: `support/fixtures.ts` `restore()` now re-points `site-url` at
`this.baseUrl` whenever the worker's origin differs from the static `BASE_URL`.
This sits next to the pre-existing sample-db re-point, which fixes the identical
class of problem (snapshot pins a shared value; per-worker backend needs its own).

**Result**: line-chart chunk 10/22 → 18/22, and the chunk ran faster (7.0m →
4.7m) — the failures were burning full action timeouts against the wrong origin.

**Classification**: NEW GOTCHA (infra), not a product bug. Nothing is wrong with
the app: site-url genuinely is misconfigured relative to the port in this setup.

### Spike-wide consequences (flagged, NOT claimed)

1. **This is a counterexample to the fidelity rule as written.** "Cypress fails
   the same tests ⇒ faithful port + real upstream behaviour" is unsound when both
   harnesses point at the same mis-configured backend. A shared *environmental*
   cause produces identical failures in both. The rule needs a third branch:
   same failures ⇒ faithful port, cause still open (environment vs upstream).
2. **RESUME.md open thread #3** (`dashboard-filters-reproductions-1`: 6 fixmes,
   "Cypress fails the same 6", "cause is not established", "both harnesses shared
   one source-mode backend + rspack server, so a common environmental cause isn't
   excluded") fits this signature exactly, and that spec is about dashboard
   filters + redirects. **Worth re-running those 6 against this fix before
   accepting the fixmes.** I have NOT verified this — it is a lead, not a claim.
   Its proposed decider ("if CI's Cypress leg is green, the delta is
   environmental") is consistent: CI runs site-url == the real host, so CI would
   be green while local fails.

## Fix 3 — MIGRATION DIVIDEND: two Cypress tests assert an href that is false, and pass

**Claim (scoped)**: In `click-behavior.cy.spec.js`, the assertions inside
`H.onNextAnchorClick(...)` do not enforce. Two tests assert an href that does not
match the href the app actually produces under the same conditions, and both are
green in Cypress.

**The tests**:
- `line chart › allows setting URL with parameters as custom destination`
- `table › should allow setting URL as custom destination and updating dashboard
  filters for different columns`

**Evidence**:
- Both tests set the dashboard's text filter by typing **"Dell Adams"** into the
  "Search the list" widget, then click a point/cell and assert
  `href === URL_WITH_FILLED_PARAMS`.
- `URL_WITH_FILLED_PARAMS` is built from `FILTER_VALUE = "123"` (spec line ~29).
  **Neither test ever enters "123"** — 123 is not a name in the People list, so
  the search widget could not accept it.
- The port uses a *faithful* hook (same `HTMLAnchorElement.prototype.click`
  patch as `H.onNextAnchorClick`), differing only in that it records the anchor
  and asserts in the test body instead of inside the callback. It captures
  `https://metabase.com/Dell%20Adams/1/2026-10` — in BOTH tests, independently.
- Cypress asserts `https://metabase.com/123/64/2025-07` for both and **passes**
  (verified against the same :4101 backend, run `cy1`).
- `Dell%20Adams/1/2026-10` is the *correct* fill: `{{text_filter_slug}}` → the
  filter value actually applied, `{{count}}`/`{{created_at}}` → the clicked
  datum of the Dell-Adams-filtered series.

Both cannot be true → the Cypress assertion is not enforced.

**Mechanism NOT established** — deliberately not claimed. Either the callback is
never invoked, or the chai failure thrown inside a monkey-patched prototype
method (called from app code, outside Cypress's command chain) is swallowed
before it can fail the test. Distinguishing them needs a further experiment I did
not run.

**Why the port catches it**: asserting *outside* the callback means a
never-invoked hook fails loudly (poll times out) instead of passing silently.
This is the generalisable lesson — **a callback-scoped assertion is only as good
as the guarantee that the callback runs**. Worth auditing other
`onNextAnchorClick` users upstream.

**Port decision**: the port asserts the observed-correct href rather than
replicating an assertion that cannot fail. See `URL_WITH_FILLED_PARAMS_ACTUAL`
in `support/click-behavior.ts`.
