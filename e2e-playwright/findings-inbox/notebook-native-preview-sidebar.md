# notebook-native-preview-sidebar

Source: `e2e/test/scenarios/question/notebook-native-preview-sidebar.cy.spec.ts` (465 lines)
Target: `e2e-playwright/tests/notebook-native-preview-sidebar.spec.ts`
Support module: **`support/notebook-native-preview-sidebar.ts`** — name matches the
spec exactly, so there is no dangling-import hazard.

Slot 3 (:4103). Jar verified **by identity**: `/api/session/properties`
`version.hash` = `751c2a9`, `target/uberjar/COMMIT-ID` = `751c2a98`. The slot's
snowplow collector reports `http://localhost:5103` (backend port + 1000), as the
brief describes.

## Result

**10 passed, 1 skipped (the upstream `@skip`).** 20/20 under `--repeat-each=2`.
`bunx tsc --noEmit` clean; imports hand-checked (tsc does not catch dead ones).

## Collision checks

- `grep -rl "notebook-native-preview" tests/ support/` → **no hits** before this
  port. No uncommitted port of this source exists.
- Read the neighbouring `notebook*` ports (`notebook-data-source`,
  `notebook-link-to-data-source`) and the native pack (`native`,
  `native-reproductions`, `native-subquery`, `sql-filters*`,
  `support/native-extras.ts`, `support/native-editor.ts`, `support/native.ts`).
  All reused read-only; nothing collided.

## Infra tier per describe, with the gate-OFF control

| describe | tier | gate-ON | gate-OFF |
|---|---|---|---|
| native query preview sidebar (5) | `default` snapshot | 5 pass | 5 pass |
| converting question to SQL (3) | `default` snapshot | 3 pass | 3 pass |
| converting to a native query (2) | `@mongo`, `mongo-5` | **1 executes+passes, 1 upstream-`@skip`** | **2 skipped** |
| tracking events (1) | snowplow | 1 pass | 1 pass |

Gate-OFF control (`PW_QA_DB_ENABLED` unset): `2 skipped / 9 passed`.
Gate-ON: `1 skipped / 10 passed`. So **the mongo test genuinely executed** — it
is real coverage, not faithful-by-construction. Gated on `PW_QA_DB_ENABLED`,
never the bare `QA_DB_ENABLED` (which leaks truthy from `cypress.env.json`).

## Snowplow: which vantage, and why

**Browser boundary** (`installSnowplowCapture`), not the per-slot collector.
`notebook_native_preview_shown|hidden` is emitted by
`trackNotebookNativePreviewShown` → `trackSchemaEvent`
(`frontend/src/metabase/query_builder/analytics.ts:27-38`) — a **frontend**
`trackSchemaEvent` call site, i.e. exactly the class PORTING says the browser
capture covers. The collector would additionally be **self-defeating** here:
`installSnowplowCapture`'s `page.route` fulfils the tracker's POST before it
leaves the browser, so nothing would ever reach the collector. Read all three of
`snowplow-collector.ts`, `iglu-validate.ts`, `worker-backend.ts` first.

`H.expectNoBadSnowplowEvents` (upstream's `afterEach`) is the **known, recorded
gap**: upstream asks micro for Iglu *validation* failures; the port's
`expectNoBadSnowplowEvents` is a structural check, because `SnowplowCapture`
discards the schema URI and so `iglu-validate.ts` cannot be wired in. Not this
port's to fix.

## Every generated-SQL assertion — raw or normalized?

**All raw.** Every one goes through `previewSql()` (`await
locator.textContent()`) plus `String.includes`, never `toContainText`/`toHaveText`.

| # | test | upstream assertion | port |
|---|---|---|---|
| 1 | smoke | `.and("contain", "SELECT")` | raw `includes("SELECT")` |
| 2 | smoke | `.and("contain", queryLimit)` (2) | raw `includes("2")` |
| 3 | smoke | `.and("contain", defaultRowLimit)` (1048575) | raw `includes("1048575")` |
| 4 | smoke | `.and("not.contain", queryLimit)` | raw `!includes("2")` |
| 5 | mongo | `.and("contain", "$project")` | raw `includes("$project")` |
| 6 | mongo | `.and("contain", "$limit")` | raw `includes("$limit")` |
| 7 | mongo | `.and("not.contain", "BsonString")` | raw `!includes(...)` |
| 8 | mongo | `.and("not.contain", "BsonInt32")` | raw `!includes(...)` |
| 9 | skipped mongo test | same four | same |

**Honest framing:** none of these assertions has *formatting* as its subject —
they are all substring containment of single tokens, for which normalization is
a no-op. So raw comparison is the strictly safer equivalent, **not** a
strengthening, and no assertion here was at risk of the "\tSELECT vs SELECT"
vacuity. Recorded because the brief asked for the audit either way.

⚠️ **CI-drift flag.** Assertions 2/3/4 pin data-derived numbers. `1048575` is the
FE default row limit (stable), but assertion 4 (`the SQL must not contain "2"`)
depends on the generated REVIEWS SQL containing no other digit `2` — a
schema-derived property. The local jar is `751c2a98`; CI builds a **merge with
master** (#79), so this class can differ there. Flagged rather than weakened.

## Two real divergences found in shared code

1. 🔴 **The shared `ad-hoc-question.ts openTable` DROPS `limit` on its notebook
   branch.** Its own comment says *"No current caller opens a table in notebook
   mode with a limit"* — **this spec makes that false.** Upstream's `openTable`
   builds ONE query object (`{"source-table", limit}`) and `mode` only selects
   the URL and the waits, so the limit is always present
   (`e2e/support/helpers/e2e-ad-hoc-question-helpers.js:166-186`). The smoke test
   depends on it: it asserts the generated SQL carries the limit and then deletes
   the `step-limit-0-0` step, which does not exist without it. Reproduced
   faithfully in the spec-local `openReviewsTableNotebook` rather than editing a
   shared module. **Consolidation candidate** — the shared helper's stated
   assumption is now stale.
2. `ORDERS_COUNT_QUESTION_ID` is missing from `support/sample-data.ts` (which has
   `ORDERS_QUESTION_ID` / `ORDERS_BY_YEAR_QUESTION_ID`). Derived **by name** from
   the same generated JSON, never hardcoded. Consolidation candidate.

## Virtualization + MongoDB natural order (the one substantive fix)

The mongo test's `should("contain", "Small Marble Shoes")` initially failed.
Ruled out as port drift by measurement:

- Same query — verified the preview really is `[{$project: …}, {$limit: 1048575}]`.
- Same locator — `[data-testid=cell-data]` resolves **90 elements** (10 rows × 9
  cols) on that page, so the testid is right.
- Same viewport (1280×800) and same navigation.
- The data is present and correct: `POST /api/dataset` returns **200 rows**.

The cause: the generated pipeline has **no `$sort`**, so row order is MongoDB
**natural order**. On this box's `mongo-sample`, natural order starts at product
id **14**, and "Small Marble Shoes" is at position **20 of 200**. The results
grid after conversion is **196px tall and virtualizes 10 rows**, so the target
row is never in the DOM. Two wheel scrolls reveal it (measured).

Fix: `scrollResultsToCell` wheel-scrolls the results grid until the cell renders.
This is a **virtualization accommodation, not a semantic change** — the assertion
afterwards is still upstream's "some *rendered* cell contains X"; the helper only
makes the app render far enough for the question to be answerable.

**Stated limit:** whether CI's mongo container orders those documents differently
is something I **could not determine** — running the Cypress original is barred
on a shared box, so I cannot say whether upstream also fails here. Recorded as
environment-bounded rather than blamed on the app; the data is definitely present
and definitely correct.

## Upstream `@skip`

`"should work for a nested GUI question (metabase#40557)"` carries
`{ tags: "@skip" }` upstream and is ported as `test.skip` **with the body
intact**. Not silently enabled; I make no claim that it now passes.

## Mutation testing

Invert the **input**, never the expectation. 8 mutants; **7 killed, 1 bad**.

| # | mutation (input) | target | outcome |
|---|---|---|---|
| M1 | feed `limit: 7`, assertions still reference `queryLimit`=2 | smoke SQL **head** | ✅ killed at `contains "SELECT" and "2"` |
| M2 | freeze `/api/dataset/native` at its first response so the preview can never update | smoke SQL **tail** | ✅ killed at `contains "1048575" but not "2"` |
| M4 | drag `-500` → `-50` | resize max-width | ✅ killed at `toBeCloseTo(maxSidebarWidth)` |
| M5 | pick table `Orders` instead of `Products` | mongo | ✅ killed at `selected-table` — **but only the head**, which is why M8/M9 exist |
| M6 | sign in as `admin` instead of `nosql` | the absence-heavy test | ✅ killed at `headerPanel.getByLabel(/View SQL/i)` — **the absence checks are not vacuous** |
| M7 | never open the covering sidebar | small-screen occlusion | ✅ killed at the covered-click assertion |
| M8 | strip `$project` from the native-preview payload | mongo preview **tail** | ✅ killed at `contains "$project" and "$limit"` |
| M9 | rewrite the product title in the `/api/dataset` result only | mongo data **tail** | ✅ killed at the `cell-data` assertion |

**Where they died mattered.** M5 died at `selected-table`, leaving both mongo
tails unproven — M8 and M9 were added specifically for them, and both killed.
Likewise M1 only proved the head, so M2 was aimed at the post-limit-removal
assertion.

### 🔴 My own bad mutation, called out

**M3 — re-pointing `installSnowplowCapture` at a dead origin
(`http://127.0.0.1:59999`) — SURVIVED, and it was a bad mutation, not vacuity.**
The capture's `page.route` predicate matches on `url.pathname === COLLECTOR_PATH`
**regardless of origin**, so re-pointing the collector disables nothing:
Playwright still intercepts the POST before it reaches the network. Probed by
asserting *presence* under the same mutation (the brief's prescribed move) —
`capture.events` printed
`[{"event":"notebook_native_preview_shown","question_id":0}]`, i.e. the event was
captured normally. The mutation changed nothing observable.

Replaced with **M3b**: register a last-wins `page.route` on the collector path so
the capture's handler never runs. **Killed** — `captured: []`, both snowplow
assertions failed while every DOM assertion still passed. So the snowplow
assertions are load-bearing.

Incidental, **measured but not fully explained**: with `snowplow-url` set to a
dead cross-origin host the POST was *still* intercepted and recorded. I did not
determine whether Chromium skipped the preflight or Playwright's route
short-circuited it, so I am not drawing a general conclusion about the
PORTING preflight note from this.

**Spec restored byte-identical** — `md5 83d37df49052466e04ddb8fd8313f90b` before
and after; support module `107cd64584459792ada5ca2478138146`. Zero `MUTANT`/`PROBE`
strings remain in either file.

## Other porting notes

- `resizeSidebar` drives **react-resizable** (`NotebookContainer.tsx` renders
  `<ResizableBox resizeHandles={["w"]}>`), i.e. react-draggable — **not** dnd-kit,
  so `support/dnd.ts` is the wrong tool. Replayed as `mousedown` on the handle
  then `mousemove`/`mouseup` on **`document`** (react-draggable's raw listeners).
  `realMouseMove(x, y)` is element-relative, not a delta, so negative `amountX`
  drags left and widens the sidebar — matching upstream's expectation.
- `cy.wait(["@updateSidebarWidth", "@sessionProperties"])` is **not** a
  retroactive no-op here: `updateUserSetting` defaults `shouldRefresh: true` and
  awaits `refreshSiteSettings()` in a `finally`, so the session-properties GET
  genuinely fires *after* the PUT. Both waits ported.
- The preview's editor really does carry `data-testid="native-query-editor"`
  (`querying/components/CodeMirrorEditor/CodeMirrorEditor.tsx:161`), so
  `H.NativeEditor.get()` inside `.within(sidebar)` resolves as upstream intends.
  Scoped to the sidebar in the port, matching the `.within`.
- The small-screen test's `cy.once("fail")` hook (asserting *"is being covered by
  another element"*) is ported as "the click must reject with a
  pointer-interception error". Proven load-bearing by M7.
- All four testids used (`native-query-preview-sidebar`,
  `notebook-native-preview-resize-handle`, `step-limit-0-0`, `selected-table`)
  were grepped against `frontend/src` **and** `enterprise/frontend/` — all exist.
- `nosql` has no entry in the `USERS` credential map but does have a cached
  session; used `signInWithCachedSession(page.context(), "nosql")`.
- `cy.get("[data-testid=cell-data]").should("contain", x)` is **ANY-OF**, so it is
  ported as `filter({hasText}).not.toHaveCount(0)` — `.first()` would have
  *weakened* it. Case-sensitive regex preserves chai's substring semantics.

## Fixmes

**None.** No `test.fixme`, no weakened assertion, no dropped or merged test.

## Summary (3 lines)

Ported 11 tests: 10 green (20/20 under `--repeat-each=2`), 1 skipped faithfully as
the upstream `@skip`; the `@mongo` tier genuinely executed, proven with a gate-OFF
control (2 skipped vs 1). All 9 generated-SQL assertions compare **raw**
`textContent`, though none had formatting as its subject, so none was at risk of
the `toHaveText` normalization vacuity. 7 of 8 mutants killed at their intended
assertions — including tail-targeted ones after M1/M5 proved only heads — and the
one survivor was **my own bad mutation**, diagnosed by asserting presence and
replaced with a mutant that killed.
