# metric-page — port report (slot 4104)

Source: `e2e/test/scenarios/metrics/metric-page.cy.spec.ts` (413 lines, 11 tests)
Target: `e2e-playwright/tests/metric-page.spec.ts`
Support module: **`support/metric-page.ts`** — matches the spec name, no dangling-import risk.

## Summary (3 lines)

11/11 green, 33/33 under `--repeat-each=3`, tsc clean, spec restored byte-identical
(md5 `bf9083fa887991054bf3ea7ba7265a53`). Eight mutants, eight killed, death sites spread
across five different tests including two tails. Two real findings: the shared per-slot
Snowplow collector is **structurally blind to frontend-emitted events** (CORS
`Allow-Credentials`, measured), and `UndoListing.tsx` **disables toast exit transitions only
under Cypress**, which makes every ported toast-dismissal a strict-mode hazard.

## Collision checks

- `grep -rl "metric-page" tests/ support/` → only `support/metrics-editing.ts`,
  `support/INDEX.md`, `support/data-studio-metrics.ts`, `support/metrics.ts` (all
  *referencing* the Cypress helper file, none porting this spec). No uncommitted port
  of my source. Cleared.
- `ls tests/` — no `metric-page.spec.ts` existed. Sibling `metric*` ports read and
  reused rather than duplicated: `metrics.ts` (`MetricPage`, `visitMetric`, `undoToast`),
  `metrics-editing.ts` (`MetricEditor`, `aboutTab`), `data-studio-metrics.ts`
  (`MetricDetail`, `waitFor{Update,Create}Card`, `renameMetricTitle`),
  `metrics-browse.ts` (read only, nothing needed).
- The Cypress `MetricPage` object is now split across **four** port modules. Flagged in
  both file headers as a consolidation candidate.

## Gate mapping, with the gate-OFF control

The brief's `external(1/2 describes)` was the wrong shape, and the coordinator's
mid-task correction matches what I had already determined from source: the only
`@external` is on **one `it`** (line 139), not on any describe. Both describes are
untagged; the nested `"ee features"` is token-scoped via `H.activateToken` in its
`beforeEach`.

Per FINDINGS #123 I checked what the untagged tests actually *do* rather than
trusting the absent tag: the top-level `beforeEach` is a plain `H.restore()` (default
snapshot) and every ungated test uses only the sample database. No `*-writable`
snapshot, no QA DB, no container.

| run | env | executed | skipped |
|---|---|---|---|
| gate ON | `WEBHOOK_TESTER_ENABLED=1`, token present | **11** | 0 |
| control A | webhook gate OFF, token present | 10 | **1** |
| control B | token env cleared, webhook ON | 8 | **3** |

Control A skips **exactly the one `@external` test** — no over-gating. Control B skips
exactly the three-test `ee features` describe. Control B is a valid control:
`support/env.ts` only populates from `cypress.env.json` when the var is `undefined`, so
setting it to `""` genuinely blocks it.

The webhook tier **did engage** — probed, not assumed: `curl 127.0.0.1:9080` → 200, and
the test passes only with the container up (it registers two `channel/http` channels
against it and asserts `send_condition === "has_result"` off the real
`POST /api/notification`). Vantage chosen deliberately: the assertion is on the
**Metabase API response**, not on webhook-tester's received-request log, so no
backend-emission question arises — upstream asserts the same response body.

## Token predicate, and how I traced it

Method: grep the FE string → follow the plugin symbol → find its `hasPremiumFeature`
guard → confirm the OSS fallback renders nothing. Then **confirm by measurement**
(MUT7 below), rather than trusting the read.

| surface | predicate | verdict |
|---|---|---|
| "Metric usage analytics" | `PLUGIN_AUDIT.InsightsMenuItem`, assigned only inside `if (hasPremiumFeature("audit_app"))` — `audit_app/index.js:50`. OSS default is `PluginPlaceholder` (`plugins/oss/audit.ts:50`) → renders null. | **real gate, no short-circuit** |
| "Dependencies" tab + "Relationships" sidebar | `PLUGIN_DEPENDENCIES.isEnabled`, set only inside `if (hasPremiumFeature("dependencies"))` — `dependencies/index.ts:15`. Consumed at `MetricTabs.tsx:69` and `DescriptionSection.tsx:33`. | **real gate** |
| "Open in Data Studio" | **not** feature-gated in the toolbar — it hangs off the plain `showDataStudioLink` prop (default `true`, set `false` only by the five `DataStudioMetric*Page` components). The token is needed for the **setup**: `createLibraryWithItems` POSTs `/api/ee/library`, and `metabase_enterprise.library.validation` puts `:feature :library` on its `defenterprise` checks. | gate is on setup, not on the asserted UI |

I did **not** inherit either the `transforms-basic` (gates nothing) or the
`writable_connection` (really gates) precedent — traced this surface directly.

**The `.env` trailing-comma trap is inapplicable here**, and I checked rather than
assumed: `support/env.ts` reads repo-root `cypress.env.json`, not `.env`. Measured
`resolveToken("pro-self-hosted")` → **64 chars, no trailing comma**. (For the record,
`.env` on this box *does* carry the trailing comma on all four token values — the trap
is real, just not on this code path.) No token value printed anywhere.

## 🔴 Finding 1 — the per-slot Snowplow collector cannot see frontend-emitted events

`support/snowplow-collector.ts` says, of the browser tracker reaching it cross-origin:

> Answering permissively costs nothing and keeps those events observable instead of
> silently dropped by CORS.

**Measured on slot 4104: it does not.** The tracker POSTs with `credentials: "include"`;
the collector's preflight reply sets `Access-Control-Allow-Origin` (echoing the origin)
but **not** `Access-Control-Allow-Credentials: true`, so the browser rejects it and the
real POST never leaves.

```
collector.requests -> ["OPTIONS /com.snowplowanalytics.snowplow/tp2"]
collector.events   -> []
page network       -> POST .../tp2  then  FAILED ... net::ERR_FAILED
MetabaseBootstrap  -> snowplow-url http://localhost:5104, enabled true, anon true
```

Isolated with a three-way `fetch` from the page to the collector:

| credentials | result |
|---|---|
| `omit` | OK 200 |
| `same-origin` | OK 200 |
| `include` | `TypeError: Failed to fetch` |

So the collector is the *only* seam for backend-emitted events (as documented and
correct) but is **blind to frontend-emitted ones** — the opposite of what its docstring
claims. One-line fix in the shared module (`"Access-Control-Allow-Credentials": "true"`);
I did **not** apply it (standing rule: no shared-module edits).

**Snowplow vantage chosen: the browser boundary** (`installSnowplowCapture`), and the
choice was *changed on evidence*. I picked the collector first, for a good reason — it is
the only seam that can reproduce `H.expectNoBadSnowplowEvents` as **real Iglu
validation** rather than the structural stand-in. That reason still holds; the mechanism
just doesn't work. And the fallback cannot be patched from my side either:
`SnowplowCapture` discards the Iglu schema URI (`events.push(outer.data.data)`), so its
events cannot be re-validated locally without editing that module too.

**Consequence, stated rather than papered over:** `expectNoBadSnowplowEvents` in this
port is **degraded** to "every payload decoded into a well-formed self-describing event".
It does not catch "the FE emits a field the schema rejects". This is not dead setup —
there is a real event assertion (`metric_page_show_more_clicked`) and a real `afterEach`,
and MUT4 proves the event assertion is load-bearing.

## 🔴 Finding 2 — the product disables toast exit transitions *only* under Cypress

`frontend/src/metabase/common/components/UndoListing.tsx:203`:

```tsx
// The react transition group state transitions are flaky in cypress
// so disable them for altogether.
const Group = "Cypress" in window ? MockGroup : TransitionGroup;
```

(and the same ternary for `Item` at :205). Under Cypress a dismissed toast leaves the DOM
immediately. Under Playwright the real `TransitionGroup` runs with `unmountOnExit` and
`exit: TOAST_TRANSITION_DURATION`, so a dismissed toast **lingers for seconds**.

Upstream's `H.undoToast().findByRole("img", {name:/close/}).click()` is therefore
instantaneous and this port's is not. Clicking close and moving straight on left the old
"Metric query updated" toast alive until the *next* toast ("Cannot revert…") arrived, and
`getByTestId("toast-undo")` then strict-mode-failed on 2 elements — **deterministic, 3/3**.
Instrumented:

```
TOASTS[pre-close]                n=1 ["Metric query updated"]
TOASTS[post-close-0ms]           n=1 ["Metric query updated"]
TOASTS[pre-history]              n=1 ["Metric query updated"]   <- still there
TOASTS[4s-after-history-click]   n=0 []
TOASTS[final]                    n=1 ["Cannot revert: missing metric"]
```

Not stranded — just slow. Fixed by gating on the state the race corrupts:
`await expect(undoToast(page)).toHaveCount(0)` after the close click. **Not** by
loosening the locator to `.first()`, which would have asserted against whichever toast
happened to be on top and could have passed on the wrong one.

This generalises: **any ported spec that dismisses a toast and then asserts on
`toast-undo` has this hazard**, and it is invisible upstream by construction.

I could not run the Cypress cross-check (standing rule — live sibling slots), so I
**cannot** confirm upstream's behaviour empirically; the `"Cypress" in window` branch is
read from source, and the mechanism above is measured only on the Playwright side.

## Pinned numeric / data-derived values flagged for CI drift

Local jar is 2026-07-18 (`version.hash 751c2a9`, matches `COMMIT-ID 751c2a98`, verified by
identity via `/api/session/properties`, not by `JAR_PATH`). CI builds a merge with master.

1. **`toHaveCount(4)` and `toHaveCount(8)`** on `/^By /` in the Overview test, plus the
   eight pinned dimension names (`By Created At / State / Category / City`, then
   `By Name / Source / Title / Vendor`). These come from the metric's computed
   `dimensions`, derived from Orders' and its FK targets' field metadata — the
   sample-data-derived class most likely to differ on a merge build. Upstream pins them;
   this port does too. **Highest drift risk in the file.**
2. **`/dashboard/${ORDERS_DASHBOARD_ID}-orders-in-a-dashboard`** — snapshot-derived slug.
   `ORDERS_DASHBOARD_ID` is read from the fixture at import time, not hardcoded.
3. **`toHaveCount(1)` on `revision-history-event`** is not pinned — upstream is
   `have.length.gte 1` and is ported as such.
4. **No metric VALUE is asserted anywhere** — the scalar's number is never read. The
   brief's "a metric's displayed value is sample-data-derived" hazard **does not bite
   here**; I checked rather than assuming it applied.
5. All fixture ids read from `cypress_sample_database.json` at import time
   (`ORDERS_ID`, `ORDERS.CREATED_AT`); none guessed.

## Mutation testing — 8 mutants, 8 killed

Inverting the **input** in every case. Baseline md5 recorded first; spec restored
byte-identical after each.

| # | mutation (input) | outcome | died at |
|---|---|---|---|
| 1 | fixture `description` → unrelated text | killed, 1 test | t1 L207, sidebar description (early) |
| 2 | fixture `name` "Orders count" → "Renamed at source" | killed, 2 tests | t1 L236 (rename block) **and t11 L656 — the dependency-graph TAIL** |
| 3 | timeseries `source-table` ORDERS→PEOPLE (+ matching breakout field) | killed, 2 tests | t4 L377 (notebook "Orders"), t5 L402 (dimension names) |
| 4 | replace the "Show more" click with a non-emitting keypress | killed, 1 test | **t5 L408 — the snowplow assertion specifically** (`captured: []`) |
| 5 | revert-stub body message → different string | killed, 1 test | **t6 L487 — the LAST assertion of that test** |
| 6 | read-only test: stay admin instead of `signIn("readonly")` | killed, 1 test | t8 L544, first absence assertion |
| 7 | `activateToken("pro-self-hosted")` → `activateToken("starter")` | killed, **all 3 EE tests** | L583, L613, L634 |
| 8 | MUT6 + skip the first assertion so the tail executes | killed | **t8 L552 — `"Move"` absence, `Expected 0 / Received 1`** |

Notes on the tails, per "check *where* each mutant dies":

- MUT2 and MUT5 are the tail-aimed follow-ups; both landed on last-assertion territory.
- MUT6 died at t8's *first* assertion, leaving that test's later absence checks unproven —
  so MUT8 was added specifically to reach them. It kills on the `"Move"` check, which was
  the one assertion in the file no other test proved from the presence side.
  `"Duplicate"`, `"Move to trash"`, `Overview` and `Definition` are independently proven
  present-for-admin by tests 1, 7 and 4 under baseline, so t8 is fully accounted for.
- **MUT7 is the empirical confirmation of the token trace above.** Swapping to `starter`
  removes all three EE surfaces, which is exactly what `hasPremiumFeature("audit_app")`
  and `hasPremiumFeature("dependencies")` predict. The source trace and the measurement
  agree.

**A bad mutation of my own, called out:** MUT2 (renaming the metric) does *not* kill test
8, and at first glance that reads as a vacuous absence assertion. It isn't — it is a bad
mutation for that test, because renaming leaves an absence check trivially satisfied. I
answered it the prescribed way, by asserting **presence** under the same mutation: MUT2's
kill of t1 L236 (`findByDisplayValue("Orders count")` no longer resolves) proves the input
exists and carries the name for an admin, so t8's absence check is distinguishing a real
state. MUT6/MUT8 then confirm it directly.

No mutant survived, so "not triggered by any failure mode I could induce" is not claimed
anywhere in this port.

## Faithfulness notes

- Two upstream call sites are bare `cy.findByText(...)` with no chained assertion
  (`H.notificationList().findByText("Your alert is all set up.")` and
  `DependencyGraph.graph().findByText("Table")`). testing-library's implicit
  throw-if-absent makes them load-bearing, so `toBeVisible()` / `toHaveCount(1)` is the
  faithful reading, not a strengthening. Noted inline.
- `H.undoToast()` is `cy.findByTestId` (singular), so `should("contain.text", x)` is
  single-element containment → `toContainText`. No ANY-of / concatenation semantics to
  preserve here.
- The `POST /api/revision/revert` stub supplies an explicit body **upstream**, and the
  test asserts that exact string in the toast. So `route.fulfill` with that JSON is
  faithful — the "cy.intercept 500 sends an EMPTY body" rule applies to bodyless stubs
  and is **inapplicable** to this one.
- `createLibraryWithItems` returns the metric id directly; upstream re-finds it with
  `GET /api/card` + a name/type filter only because the Cypress helper aliased it.
  Documented deviation: same metric, strictly more precise.
- Nothing dropped, weakened or merged. The one genuine weakening is
  `expectNoBadSnowplowEvents`, forced by Finding 1 and stated in the spec header.

## Hazards from the brief that did NOT apply (checked, not assumed)

- `.env` trailing comma — wrong file for this code path (see above).
- `WRITABLE_DB_ID` / snapshot-vs-constant — no writable DB anywhere in this spec.
- Debris schemas / container hygiene — no schemas or temp tables created.
- `blank.sql` corruption — only the `default` snapshot is used.
- The 1280×720 harness defect — no failure here was layout- or popover-position-dependent.
- Empty-state-renders-pre-fetch — the metric page does fetch its value, but no assertion
  in this spec anchors on the scalar; `visitMetric` already gates on
  `POST /api/card/:id/query`.

## Housekeeping

- **tsc**: `bunx tsc --noEmit` clean for both my files. No sibling noise was present on
  this run (so nothing to attribute to others).
- **Dead imports**: checked by hand with a script, and the script was **self-tested** by
  injecting a known-dead import (`visualize`) and confirming it was reported. Result: 32
  imported symbols in the spec, 7 in the support module, **0 dead**.
- **Shared state**: `token-features` on :4104 read **0/59 before and 0/59 after** my final
  run (the per-test `mb.restore()` resets the token; the last test does not activate one).
  Cards, the library collection and notification channels are all snapshot-scoped and
  reverted by `restore()`. `anon-tracking-enabled` was already `true` before I started.
  A final `restore()` run was executed to leave the slot clean.
- Scratch probe spec (`tests/zz-sp-probe.spec.ts`) deleted; no `test-results/metric-page-*`
  left behind. Siblings' artifacts and the sleeping poller untouched.
- No commits, no edits to shared support modules, `PORTED.txt`, `QUEUE.md` or
  `playwright.config.ts`. Port 4000 never contacted.

## Fixmes

None. No `test.fixme`, no skipped-for-product-bug tests.
