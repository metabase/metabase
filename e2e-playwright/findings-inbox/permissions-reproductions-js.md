# permissions-reproductions (the **.js** sibling) — slot 1 / port 4101

Source: `e2e/test/scenarios/permissions/permissions-reproductions.cy.spec.js` (661 lines)
Target: **`tests/permissions-reproductions-js.spec.ts`**
Support: **`support/permissions-reproductions-js.ts`**

> Filed as `permissions-reproductions-**js**.md` because
> `findings-inbox/permissions-reproductions.md` **already exists** and belongs to
> the `.ts` sibling's port. Same collision as the spec filename — see below.

---

## 🔴 COLLISION CHECK — the brief's target name was already taken, correctly

The queue assigned target `tests/permissions-reproductions.spec.ts`. **That file
already exists, is committed (`aac52adf001`, batch-10), and is a port of a
DIFFERENT source.** Writing to it would have destroyed landed work.

`e2e/test/scenarios/permissions/` holds a **disjoint sibling pair** — the exact
hazard PORTING records for `visualizations-charts-reproductions`:

| upstream file | size | issues | status |
|---|---|---|---|
| `permissions-reproductions.cy.spec.**ts**` | 4.5 KB | 11994, 39221, 76710 | already ported → `tests/permissions-reproductions.spec.ts` |
| `permissions-reproductions.cy.spec.**js**` | 19 KB | 13347, 14873, 17777, 19603, 20436, 22447/22449/22450, 22473, 22695, 22726, 22727, 23981, 24966 | **this port** |

Zero issue-number overlap; the two are genuinely different specs. I ported the
**`.js`** file, as assigned, to a `-js`-suffixed target.

**Note the collision was three-way**: spec filename, support module name, *and*
findings-inbox filename all wanted the same stem. All three are `-js`-suffixed.

### 🔴 SUPPORT MODULE NAME DEVIATION (flagging loudly, as instructed)

My support module is **`support/permissions-reproductions-js.ts`**, NOT
`support/permissions-reproductions.ts`. The `-js` suffix follows the existing
`support/native-reproductions-js.ts` precedent. Nothing shared was edited.

Also checked: `e2e/test-component/` contains no same-basename sibling.

---

## 🔴 FIXTURE IDS — and two I nearly got wrong

Every id read from source. **Two ids I had initially written from inference were
wrong, and the mistake was silent** — worth recording because both would have
produced a confidently green test against the wrong object:

| constant | value | read from | note |
|---|---|---|---|
| `ALL_USERS_GROUP` | 1 | `e2e/support/cypress_data.js:43` | |
| `COLLECTION_GROUP` | 5 | `cypress_data.js:45` | |
| `DATA_GROUP` | 6 | `cypress_data.js:46` | |
| `ORDERS_QUESTION_ID` | **94** | derived in `support/sample-data.ts` | I first wrote `1` — wrong |
| `ORDERS_DASHBOARD_ID` | **10** | derived in `support/sample-data.ts` | I first wrote `1` — wrong |
| `NODATA_USER_ID` | 3 | derived from `cypress_sample_instance_data.json` | |
| `PG_DB_ID` | 2 | the spec's own literal | |
| `nocollection` name | "No Collection Tableton" | `cypress_data.js` USERS | |

All three entity ids are now **derived at import time**, not hardcoded.

Confirming the brief's warning concretely: `DATA_ANALYSTS_GROUP: 4` is **not in
`USER_GROUPS` at all** — it lives in a separate `MAGIC_USER_GROUPS` map
(`cypress_data.js:51-54`). Anyone counting group ids sequentially lands on it.
Not used by this spec.

---

## Infra tier per test, and the gate-OFF control

| describe | test | tier |
|---|---|---|
| 13347 | 2 tests | **upstream `@skip`** + `@external` → ported as skipped |
| postgres > user > query | 14873 | `@external` (postgres-12) + token (`sandboxes`) |
| 17777 | 1 test | **upstream `@skip`** → ported as skipped |
| 19603 | 1 test | bare jar |
| 20436 | 1 test | token |
| 22447/22449/22450 | 2 tests | test 1 bare jar; test 2 token |
| 22473 | 1 test | **email** (maildev) |
| 22695 | 1 test | token |
| 22726 / 22727 / 23981 | 3 tests | bare jar |
| 24966 | 1 test | token (`sandboxes`) |

**Executed vs skipped (measured, both directions):**

| run | passed | skipped |
|---|---|---|
| `PW_QA_DB_ENABLED=1` | **11** | 3 |
| gate OFF (control) | **10** | 4 |

The gate accounts for **exactly one** test (14873) — it is real and correctly
scoped, and nothing silently skips that should run. The 3 constant skips are the
two upstream-`@skip` describes (13347 ×2, 17777 ×1). No `afterEach` exists, so
the gate-off control could not hit the "48 failed instead of 48 skipped"
teardown trap.

`--repeat-each=3` full-file in order: **33/33 passed**. Final `--repeat-each=2`:
**22/22**. **No order-dependence found** on this `-reproductions` file.

Infra verified rather than assumed: backend `version.hash = 751c2a9` matches
`target/uberjar/COMMIT-ID 751c2a98` (jar mode, PID confirmed via `lsof`);
maildev is **2.x** (`/email` 200, `/api/email` 404 — i.e. NOT the 3.x version
that makes email specs silently gate-skip while looking green).

**Token probed, not assumed:** `pro-self-hosted` = **42** features, with
`sandboxes: true` and `advanced_permissions: true` (and `transforms-basic:
false`, matching the brief). Both sandboxing tests genuinely need it.

**`@external` red herring cleared:** `PG_DB_ID` is the literal `2`, and under the
`postgres-12` snapshot database 2 is the **read-only QA Postgres12 sample**, not
the writable container. So FINDINGS #85 contamination does not apply here and I
touched no shared writable schema.

---

## Mutation testing — 12 mutants, 11 killed, 1 bad mutation (mine), 0 survivors

Method: invert the **input**, never the expectation. Spec restored
**byte-identical** afterwards (`shasum` verified: `3e0ba0dd…` / `7dba67f2…`), and
a residual scan for `MUTANT|PROBE|console.log|waitForTimeout|test.only` is clean.

| # | test | mutation | result | **died at** |
|---|---|---|---|---|
| M1 | 14873 | `sandboxTable` → plain **unrestricted** grant (isolates the *sandbox*, not access) | **killed** | row count: `"Showing first 2,000 rows"` vs `"1 row"` |
| M1b | 14873 | M1 **plus** row-count + "Hudson" assertions removed, so the tail carries alone | **killed** | tail: `is_sandboxed` false |
| M2 | 22447 t1 | sign in as **admin** instead of `nodata` | killed | `toHaveAttribute("data-disabled")` |
| M3 | 22447 t2 | remove the `blocked` permission-graph write | killed | permission-error text absent |
| M4 | 22695 | remove the `blocked` permission-graph write | killed | "Sample Database" appears in search |
| M5 | 23981 | collection graph `root: "none"` → `"read"` | killed | "Our analytics" now present |
| M7 | 22473 | **never unsubscribe** (Escape instead of the Unsubscribe click) | **killed** | final absence assertion |
| M8 | 24966 | give `nodata` `attr_cat: "Widget"` instead of `"Gizmo"` | killed | `getByLabel("Gizmo")` |
| M9 | 19603 | remove `archiveCollection` | killed | "Second collection" now present |
| M10 | 20436 | never restore the permission (leave it at "No") | killed | final "Query builder only" |
| M11 | 22727 | vacuity probe — see finding 1 | n/a (probe) | — |
| M12 | 22726 | click "Move" instead of "Duplicate" | **BAD MUTATION — see below** | click timeout (setup, not an assertion) |
| M12b | 22726 | sign in as `normal` (a user *with* collection access) | killed | personal-collection name assertion |

**I call out M12 as my own bad mutation.** It died at a `locator.click` timeout
because "Move" is not in that popover at all — i.e. it broke the *setup*, so it
proved nothing about the assertions. Redone as M12b (an input inversion that
reaches the assertions), which killed properly.

**On the highest-stakes probe the brief asked for** — "remove the restriction and
confirm the test goes red": M1/M1b do exactly that for sandboxing, and M3/M4/M5
for the permission-graph tests. Every one went red. **No permissions test here
stays green when the permission is granted.**

**M1 died mid-test, so I aimed M1b at the tail.** M1 killed at the row count,
leaving `assertDatasetReqIsSandboxed` unproven; M1b removed the earlier
assertions so the tail had to carry, and it also went red. **Two independent
proxies observe the sandbox restriction** — the standard FINDINGS #87 set.

**M7 is the one I care about most.** PORTING records a *measured* case where an
unsubscribe test stayed green with the unsubscribe deleted, because
`NotificationEmptyState` renders pre-fetch. I anchored on `notifications-list`
(which `NotificationList.tsx` renders **only** when `listItems.length > 0`)
disappearing, before asserting the text is gone. M7 confirms the anchor works:
skipping the unsubscribe turns it red.

---

## Product / test-quality findings

### 1. metabase#20717's assertion is vacuous upstream — with the "can it ever match?" probe run

`cy.findByText(/^Replace original qeustion/).should("not.exist")` — **"qeustion"
is a typo upstream**. Ported verbatim per the faithfulness rule, with the
analysis inline.

I did not stop at reading the source. Running this exact flow as **admin** — a
user who genuinely *is* offered the replace option — measured:

```
typo-spelling matches = 0     correct-spelling matches = 1
```

So the typo'd locator matches nothing **even in the state that is supposed to
trigger it**, while the corrected locator demonstrably *can* match. Precisely:

- as written, the assertion **cannot fail under any app behaviour**;
- the behaviour it *intends* to check is **correct today** (the view-only user
  is not offered the option), so fixing the typo would keep the test green *and*
  make it load-bearing;
- but as-is, a regression re-introducing that option would go **undetected**.

**Test defect, not a product bug.** Identical semantics in Cypress → upstream's
hole, not port drift. Not silently "fixed": repairing a disabled assertion inside
a port would hide that it had ever been disabled (FINDINGS #87/#89 precedent).

### 2. Same test: the `.then((modal) => …)` callback discards its argument

Upstream's callback issues **unscoped** `cy.findByText` queries, so both run
against the whole document rather than the save modal. Ported page-wide to match
what actually executes, with a comment. Same family as the read-the-helper
(#25/#53) cluster.

### 3. `assertDatasetReqIsSandboxed` is in its degraded mode at BOTH call sites here

Both upstream calls pass only `requestAlias` and **no column options**, so per
FINDINGS #87 the helper checks `is_sandboxed` alone — the query processor
self-reporting that a sandbox *ran*, never that data was *filtered*. That is
faithful to upstream and I left it. Worth recording that in this spec it is **not
load-bearing on its own**: in both tests an independent observation (14873's row
count; 24966's Gizmo-vs-Widget field values) carries the actual data-restriction
claim, which is why M1/M1b and M8 kill.

### 4. `support/homepage.ts getDatabaseFields` — docstring overstates what it returns

Its docstring says it builds the `{ TABLE: {FIELD: id}, TABLE_ID: id }` map that
`H.withDatabase` hands its callback, but the implementation only builds the
**field** half; no `<TABLE>_ID` keys are ever set. Harmless for its current
callers (they only read fields), latent for anyone porting a `withDatabase`
call that destructures `PEOPLE_ID`. I wrote a local `withDatabase` returning both
rather than edit the shared module. **Consolidation candidate.**

### 5. `support/sample-data.ts USERS.sandboxed.email` disagrees with the fixture

`sample-data.ts` has `sandboxed: { email: "sandboxed@metabase.test" }`;
`cypress_data.js` has the sandboxed user as **`u1@metabase.test`**. Currently
harmless — `LOGIN_CACHE` has a `sandboxed` entry so `signIn` never reaches the
credentials fallback — but the fallback path would fail to authenticate. Not
touched (shared file). **Recorded, not fixed.**

**No product bugs claimed.** Nothing in this spec failed in a way I could not
attribute to my own port drift, and I did not run a Cypress cross-check (banned
while sibling slots are live) — so **I cannot say whether upstream behaves
identically on any of the above**, and I am not implying I checked.

---

## Two run-1 failures, both my own port drift (not app bugs)

Recording these because both are documented traps I *wrote a comment about* and
then still fell into — the comment is not the fix.

1. **22473 — `locator.blur()` timed out (30s).** I "captured the RecipientPicker
   input in a variable" to dodge the placeholder trap. **A Playwright `Locator`
   is lazy** and re-resolves on every use, so capturing it in a variable does
   nothing at all; the placeholder is gone the moment the first pill commits.
   Fixed with an **`elementHandle()`**, which is bound to the node, so the blur
   reaches the element Cypress actually typed into.
   *Worth adding to PORTING:* the existing rule says "capture the element first",
   which reads as satisfied by a variable. It isn't — it needs an ElementHandle.

2. **24966 — `response.json()` → "No resource with given identifier found".** I
   registered the dashcard-query wait before `visitDashboard`, capturing the
   **on-load** query; Chromium had evicted its body by assertion time. Upstream
   reads a Cypress alias at the end, and an alias holds the **last** matching
   response — i.e. the *filtered* query. Fixed by registering the wait
   immediately before the "Add filter" click and reading the body promptly.

---

## Strengthening (declared explicitly, as the tier allows)

Three places, all **anchors rather than assertions** — no expectation was
tightened:

1. **22473** — anchored the post-unsubscribe absence on `notifications-list`
   disappearing. Upstream has only the bare text absence, which the pre-fetch
   empty state satisfies. **M7 proves this was necessary**, not decorative.
2. **22447 t2** — `H.queryBuilderFooter().findByTestId(…).should("not.exist")`
   carries an implicit existence requirement on the footer (Cypress errors on a
   missing subject). Ported that as its own `toBeVisible()` anchor so the two
   absence checks under it cannot pass on an unrendered page.
3. **22695** — kept upstream's `should("have.length.above", 0)` as a real
   assertion. It is what stops the `not.contain` half being vacuous.

Everything else is faithful. **No test dropped, weakened, or merged.** Both
upstream `@skip` describes are ported as skips with their bodies intact so they
can be re-enabled without a rewrite — I did **not** silently enable them and I
make no claim about whether they now pass.

Assertion semantics handled per the brief: `should("contain", x)` /
`.and("not.contain", …)` ported as ANY-OF (not `.first()`, which would have
weakened it); `.invoke("text").should("not.eq", …)` ported via raw
`textContent()` rather than `toHaveText` (whitespace normalization);
`should("have.attr", "data-disabled")` ported as one-arg presence.

---

## Fixmes / tsc

- **Zero `test.fixme`.** All 11 runnable tests pass; the 3 skips are upstream's.
- `bunx tsc --noEmit` clean for my files. The known pre-existing
  `tests/actions-on-dashboards.spec.ts` error (another slot's) is untouched.
- No shared support module edited; `PORTED.txt` / `QUEUE.md` /
  `build-helper-index.mjs` untouched; nothing committed. My own
  `test-results-perm-repro-js/` output dir removed; siblings' left alone.

---

## Summary (3 lines)

The queue's target filename was already occupied by a **committed port of a
different, disjoint upstream sibling** (`.ts` vs `.js`); I ported the assigned
`.js` file to `tests/permissions-reproductions-js.spec.ts` with support module
`support/permissions-reproductions-js.ts`, overwriting nothing.
11 of 14 tests run green (3 are upstream `@skip`s), 33/33 under `--repeat-each=3`
with no order-dependence, gate-OFF control 10 passed / 4 skipped, and 11 of 12
mutants were killed — including "grant the permission" and "never unsubscribe",
so no test here stays green when its restriction is removed.
One test-quality finding: metabase#20717's assertion is vacuous upstream via a
`qeustion` typo — measured with a can-it-ever-match probe (typo 0 / correct 1
against a user who *is* offered the option) — ported verbatim, not silently fixed.
