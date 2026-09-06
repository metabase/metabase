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

### Spike-wide consequences

1. **This is a named instance of the shared-environmental-cause class** that
   PORTING.md's "The cross-check alone CANNOT tell you a behaviour is real"
   section describes — and the first one that is a **backend setting** rather
   than the local FE bundle. It fooled the cross-check on 11 tests at once:
   Cypress failed all 11 identically, which reads as "faithful port + real
   upstream behaviour" and was wrong. Unlike the bundle cases it is cheap to
   spot once named — check the **origin**, not just the pathname.
2. **Corrected**: an earlier draft of this entry suggested this might explain
   `dashboard-filters-reproductions-1`'s 6 fixmes (RESUME thread #3). **It does
   not, and I have retracted that.** Thread #3 was closed independently with a
   same-slot controlled comparison in which only the *artifact* changed (CI
   uberjar 6/6 pass vs source-mode + hot bundle 6/6 fail). That jar run was
   itself on a per-worker backend (slot 11 / :4111), where site-url would have
   been equally stale — so site-url cannot be the variable that flipped it. Two
   distinct environmental causes with the same signature; do not conflate them.
3. **Guard for the future**: `expectLocation`-style helpers that compare only
   `pathname` + `search` cannot see a wrong-origin navigation. That blindness is
   what let this reach a downstream assertion and masquerade as an app bug.

## The one test left disabled — `test.fixme` on metabase#33379

`interactive embedding › allows opening custom URL destination that is not a
Metabase instance URL using link (metabase#33379)`. **41/42 pass; this is the
one.** Not claimed as a product bug — it is untestable under the current
per-worker harness, for two independent reasons, both verified.

**1. The harness's `MB_SITE_URL` pin defeats the test's own premise.**
The test's whole point is a site-url that DIFFERS from the instance's real
origin: it does `updateSetting("site-url", "https://…/subpath")` and then checks
that a link to the actual instance still behaves correctly. Slot backends now
boot with `MB_SITE_URL=http://localhost:<port>` (`support/worker-backend.ts`,
thread #4 — the right fix for the drill-through problem). Settings resolve **env
before the app DB**, which is exactly why that fix survives `restore()` — and it
equally means **the test's write is silently ignored**. Measured on the jar:

```
site-url BEFORE: http://localhost:4101
attempting to set: https://localhost:4101/subpath
site-url AFTER : http://localhost:4101     <- unchanged, PUT reported success
```

So the mismatch the test needs cannot be constructed. The PUT does not error —
it just does nothing.

**2. The Cypress original is un-cross-checkable on a slot backend.**
It hard-codes `const metabaseInstanceUrl = "http://localhost:4000"` and
`site-url = "https://localhost:4000/subpath"`. On a :4101 backend those point at
a *different Metabase* (the shared dev instance), so running it there tests
nothing about :4101 — and would drive a browser at :4000, which slot agents must
not touch. The test is only meaningful when the backend IS :4000. My earlier
un-grepped Cypress run stalled on precisely this test and never reported.

**Verified on the jar** (`target/uberjar/metabase.jar`, CI EE build) — the
failure is not a source-mode artifact. Observed there: the click does a full
same-tab navigation (no popup) to `<origin>/404`, and the app lands on
`/auth/login` because `visitEmbeddedPage` signs out. Whether the app *should*
render its 404 page for a signed-out user is exactly the question the test
exists to answer — and it is the question this harness cannot currently pose.
**I did not establish what the correct behaviour is, and make no claim about it.**

### Trade-off this exposes — for the harness owner (thread #4)

`MB_SITE_URL` (env) vs a post-`restore()` `PUT /api/setting/site-url` (DB write)
are not equivalent, and the difference is invisible until a test writes site-url:

| | env pin (current) | restore-time DB write |
|---|---|---|
| survives `restore()` | yes (env beats DB) | yes (re-applied each restore) |
| cost | none | one PUT per restore |
| **test can override site-url** | **no — silently ignored** | **yes** |

I independently hit the same site-url bug and had implemented the DB-write
variant before finding thread #4; I **removed mine** — the env pin is cheaper
and thread #4 got there first, and duplicate machinery is worse than none.
Flagging the trade-off rather than re-litigating it: if any other spec needs to
*manipulate* site-url, the env pin will defeat it the same silent way, and the
DB-write variant is the escape hatch. Not acting on this unilaterally.
