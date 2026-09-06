# sandboxing-via-api (slot 5, port 4105)

Source: `e2e/test/scenarios/permissions/sandboxing/sandboxing-via-api.cy.spec.js` (1376 lines)
Target: `e2e-playwright/tests/sandboxing-via-api.spec.ts` + `support/sandboxing-via-api.ts`
Artifact: local CI uberjar `target/uberjar/metabase.jar`, `COMMIT-ID 751c2a98`;
verified live rather than trusting the env var — `GET :4105/api/session/properties`
→ `version.hash = 751c2a9`, `date 2026-07-17`.

## Summary (3 lines)

29/29 tests ported 1:1 and executed green on the jar (55s), **0 gate-skipped**,
0 fixmes; 58/58 under `--repeat-each=2`; `tsc --noEmit` clean.
Two upstream assertions are provably inert — a typo'd option name and a
`PEOPLE.USER_ID` constant that does not exist — both ported verbatim rather
than silently "fixed", with the corrected forms measured and reported.
Mutation testing killed every mutant, including the headline
remove-the-sandbox-policy probe and three aimed specifically at tail assertions.

## Executed vs gate-skipped, with the gate-off control

| run | executed | skipped |
| --- | --- | --- |
| `PW_QA_DB_ENABLED=1` (the briefed loop) | **29** | 0 |
| gate-OFF control (no `PW_QA_DB_ENABLED`) | **29** | 0 |
| `--repeat-each=2` | **58** | 0 |

**This spec has no QA-DB dependency at all** — every test runs against the H2
sample database, so `PW_QA_DB_ENABLED` gates nothing here and the identical
control is the expected result, not a dividend. Stating it plainly because the
brief's landed-port table (11/0 vs 6/5, etc.) sets up the opposite expectation:
on this spec there is nothing for that flag to switch off.

The FINDINGS #49 "green run that never executed" risk on this file lives
entirely in **one** test: `sandboxed user should receive sandboxed dashboard
subscription` (upstream `{ tags: "@external" }`), the only test that **reads**
the inbox. It is gated on `isMaildevRunning()` and it **executed** — see the
container evidence below.

The other SMTP-touching test (`#14990`) only needs email *configured* (it
asserts the subscriptions sidebar forwards to email and never reads mail), so
per the brief it uses `configureSmtpSettings` — no container, no gate.

## Container evidence

`docker ps` → `metabase-e2e-maildev-1  maildev/maildev:2.2.1` (**2.x**, so the
PORTING 3.x REST-path trap — which makes email specs gate-skip while reporting
green — does not apply).

Read the container directly after the run rather than inferring from the exit
code (`GET http://localhost:1080/email`):

```
messages: 1
 subject: Orders in a dashboard
  html len: 33276 | has 37.65: True | has 148.23: False
```

That is a real 33 KB rendered subscription email whose body contains the
sandboxed user's row (`37.65`) and **not** the other user's (`148.23`) — i.e.
the sandbox was applied to the server-side subscription render, which is the
whole point of that test. `H.setupSMTP` → `PUT /api/email` live-validates the
SMTP connection, so a down container would have thrown, not skipped.

**Not verified:** the gate-OFF arm of the maildev gate (confirming the test
skips rather than fails with the container down). I deliberately did not stop
`metabase-e2e-maildev-1` — it is shared with the four sibling slots.

## Fixmes

None.

## Two upstream assertions that assert less than they appear to

Both are **ported verbatim**. Neither is port drift; both are vacuous *upstream*
too, so per PORTING's "if Cypress has the same semantics, it is vacuous upstream
too" rule the honest move is to record them, not to quietly strengthen a
security test into a shape upstream never ran.

Shared mechanism, worth generalising: **`assertDatasetReqIsSandboxed` silently
degrades to an `is_sandboxed`-only check whenever either of `columnId` /
`columnAssertion` is falsy** (`if (columnId && columnAssertion)`). And
`is_sandboxed` is a *self-report from the query processor* that a sandbox ran —
never a check that the data was actually filtered. So a degraded call verifies
that sandboxing executed, not that it restricted anything. Any audit of
sandboxing coverage should grep for call sites whose `columnId` resolves to
`undefined` or whose option name is misspelled; the helper cannot tell you, and
the test stays green either way.

### 1. `columnAssetion` — a typo'd option name

`normal user › question with joins › should be sandboxed even after applying a
filter to the question`:

```js
H.assertDatasetReqIsSandboxed({
  columnId: ORDERS.USER_ID,
  columnAssetion: ATTRIBUTE_VALUE,   // sic — "Assetion"
});
```

The guard is false, so the per-row "every value in ORDERS.USER_ID equals 3"
assertion never runs.

Fixing the typo alone would **not** make the test pass: `ATTRIBUTE_VALUE` is the
string `"3"` and the column holds the number `3`.
**Measured on the jar** (both arms run):

- `columnAssertion: ATTRIBUTE_VALUE` (string) → **FAILS**
  (`expect(values.every(...)).toBe(true)` → received `false`).
- `columnAssertion: Number(ATTRIBUTE_VALUE)` → **PASSES**.

So the typo masks a second defect, and the data really is sandboxed to user 3 —
the assertion was simply never evaluated. One-line upstream fix:
`columnAssertion: Number(ATTRIBUTE_VALUE)`. Porting the "fixed" string form
would have turned the test red for a reason that is not a product bug, which is
why it is kept verbatim with a comment at the call site.

### 2. `PEOPLE.USER_ID` is `undefined`

`Sandboxing reproductions › should allow using a dashboard question as a sandbox
source`:

```js
H.assertDatasetReqIsSandboxed({
  columnId: PEOPLE.USER_ID,
  columnAssertion: Number(ATTRIBUTE_VALUE),
});
```

`SAMPLE_DATABASE.PEOPLE` has no `USER_ID` field (keys: ID, ADDRESS, EMAIL,
PASSWORD, NAME, CITY, LONGITUDE, STATE, SOURCE, BIRTH_DATE, ZIP, LATITUDE,
CREATED_AT), so `columnId` is `undefined` and only `is_sandboxed` is checked.
The intended column is almost certainly `PEOPLE.ID` — which is exactly what the
structurally identical `should show filtered categories` test uses.

**Measured:** substituting `columnId: PEOPLE.ID` keeps the test green, so this is
a free upstream fix rather than a masked failure.

## Mutation testing

Every mutation inverts the **input**, never the expectation, and every one was
run on the jar on slot 5. The spec was restored from a byte-identical backup
between mutants and re-verified 29/29 at the end.

### M1 — remove the sandbox policy itself (the brief's headline probe)

In `simple sandboxing should work (metabase#14629)`, replaced the
`sandboxTable(...)` call with a plain `updatePermissionsGraph` granting
`view-data: "unrestricted"` + `create-queries: "query-builder"` on the whole
sample DB for `COLLECTION_GROUP`. (Deleting `sandboxTable` outright would have
left the user with *no* access and killed the test for the wrong reason — the
point is "same user, same query, no sandbox".)

- **KILLED** at `assertQueryBuilderRowCount(page, 11)`:
  `Expected substring: "11 rows" / Received: "Showing first 2,000 rows"`.
- Follow-on **M1b**, with the row-count assertion also removed so the
  response-body assertion is the one under test: **KILLED** inside
  `assertDatasetReqIsSandboxed` (`is_sandboxed` → `false`).

Both the row-count proxy and the response-body assertion independently observe
the restriction. This is the proof the brief asked for: the restricted-data
assertions are load-bearing, not a coincidence of fixture data.

### M2 — corrupt the attribute value, nothing else

In the `normal user` beforeEach, changed the attribute **written to the user**
(`PUT /api/user/:id login_attributes`) from `"3"` to `"5"`, leaving every
assertion's expected value at 3 — the "corrupt what the assertion does not
track" form.

**KILLED in all three** `normal user` tests:

| test | died at |
| --- | --- |
| should display correct number of orders | `getByText("3").toHaveCount(10)` → received 0 |
| should be sandboxed even after applying a filter | `firstColumnCells.toHaveCount(10)` → received 1 |
| should show filtered categories | `assertDatasetReqIsSandboxed` (PEOPLE.ID column values) |

Note the middle row dies on a **row count**, not on
`assertDatasetReqIsSandboxed` — a live demonstration that that test's column
assertion (finding #1) contributes nothing.

### M3 — mutants aimed deliberately at tail assertions

M1/M2 die early, so three mutants were aimed past the first assertion.

**M3a — `#13641`, drill the wrong bar** (`.nth(0)` → `.nth(1)`):
**KILLED** at `getByText("Product → Category is Doohickey")`.

> **Sub-result worth recording, because it contradicts the obvious guess.** With
> the two post-drill *text* assertions also removed, the tail
> `assertQueryBuilderRowCount(page, 2)` **SURVIVED** this mutation — both
> categories happen to yield 2 rows for the sandboxed user. That is a *bad
> mutation for that assertion*, not vacuity: it perturbs which bar was clicked,
> which the row count was never meant to detect. Answered it with a mutation the
> row count *is* meant to detect —

**M3a2 — `#13641`, sandbox policy removed** (same swap as M1, applied to this
test): **KILLED at `assertQueryBuilderRowCount(page, 2)`** —
`Expected "2 rows" / Received "Showing first 2,000 rows"` — and note it got
there *after* the two text assertions passed, so the tail row count is genuinely
load-bearing against the security-relevant change. Both 13641 variants
(REMAPPED and DEFAULT) died identically.

**M3b — `#14841`, never hide the column** (dropped the eye-icon click, kept an
existence assertion in its place so the test still reaches the tail):
**KILLED** at `expect(page.getByText("Subtotal")).toHaveCount(0)`. This also
validates the new anchor — the un-anchored form of that assertion is exactly the
vacuity shape PORTING warns about.

**M3c — Data Reference, widen the sandbox source card** (`SELECT ID, NAME,
EMAIL` → `… , CITY`): **KILLED** at the hidden-columns
`expect(scope.getByText("CITY")).toHaveCount(0)` loop. So the hidden-column half
of that loop genuinely observes the sandbox's column restriction and is not
passing on an unrendered page.

**No surviving mutants** (the one survivor above is accounted for and answered).

## Anchors added (absence assertions that would otherwise be vacuous)

Three places where the original's `should("not.exist")` retries in a window
where nothing has rendered yet. Per PORTING the fix is an **anchor**, not a
different assertion form — `toHaveCount(0)` is kept throughout, since it is the
faithful equivalent of `should("not.exist")`.

1. **`verifyCategoryList`** (`should show field values for sandboxed users`).
   `allCategories` is ordered `["Gadget","Gizmo","Doohickey","Widget"]`, so for
   the sandboxed user (expected `["Widget"]`) upstream runs **three `not.exist`
   checks before the single presence check** — an unpainted popover satisfies
   all three. The port asserts the popover visible, then all *expected* values,
   then all *unexpected* absences: same assertions, reordered so the absence
   half cannot be satisfied by an empty list.
2. **`#14841`**. My first anchor was **wrong and the run caught it**: I gated on
   `sidebar-left` reaching count 0, but `sidebar-left` is the QB's
   always-mounted left rail and stays at 1 forever. Replaced with the settings
   panel's own "Done" button reaching count 0 (proves the click applied) plus
   the table root being visible (proves results painted). Small trap worth
   knowing: **`getByTestId("sidebar-left")` is not a "settings sidebar is open"
   signal in the query builder.**
3. **`Data Reference field list excludes sandbox-hidden columns`**. Upstream's
   `H.main().within(...)` carries an implicit existence assertion on `main`
   which a naive `scope.getByText(x).toHaveCount(0)` drops (PORTING's "a Cypress
   chain carries an implicit existence assertion" rule). Ported the anchor as
   its own `expect(main).toBeVisible()`.

## Notes for the consolidation pass

- `support/sandboxing-via-api.ts` adds `visitQuestionCapturingCardQuery` and
  `openTableCapturingDataset`: response-**returning** variants of the shared
  `ui.visitQuestion` / `ad-hoc-question.openTable`. Cypress's
  `assertDatasetReqIsSandboxed` reads a `cy.intercept` alias, so every
  sandboxing spec needs the `Response` object, and both shared helpers return
  `void`. Cheap consolidation: have the shared helpers return the responses they
  already await — nothing would break, and several permissions ports could drop
  local copies.
- `H.openTable`'s `callback` option (the
  `xhr => expect(xhr.response.body.error).not.to.exist` idiom, used 5× in this
  spec alone) has no shared port for the same reason.
- `savePermissions` (H.savePermissions) is a **third** member of the
  save-permissions family, alongside `savePermissionsGraph`
  (data-model-permissions.ts) and `saveAndConfirmPermissions`
  (download-permissions.ts) already flagged in PORTING. Upstream has exactly one
  of each; all three should collapse into one shared permissions helper.
- `NORMAL_USER_ID` is now re-derived in a **seventh** module (ai-controls,
  click-behavior, documents, metabot-usage-auditing, personal-collections,
  search-filters, user-settings, here). It belongs in `support/sample-data.ts`
  next to `ORDERS_DASHBOARD_ID`.
- `ORDERS_DASHBOARD_DASHCARD_ID` is re-derived in a third module
  (dashboard-core.ts, filters-repros.ts, here) — same fix.
- `assertTableRowsCount` exists twice: Page-only in `native-extras.ts` and
  scope-taking in `interactive-embedding.ts`. Only the scope-taking one can port
  `H.getDashboardCard().within(() => H.assertTableRowsCount(n))`, so importing
  the "obvious" one is a typecheck error waiting for every dashcard caller.
  Promote the scope-taking version.

## Things deliberately NOT done

- **No Cypress cross-check.** Per the brief and PORTING's 🔴 rule, `H.restore()`
  re-points database 1 at the shared `e2e/tmp` H2 file and would break the four
  live sibling slots. Nothing here needed one: no test was fixme'd and **no
  product-bug claim is made**. The two findings above are *test* defects
  readable directly from the source and confirmed by measurement on the jar —
  not behavioural claims about the application.
- **Did not "fix" the two inert assertions** in the port. Reasoning above.
- **Did not stop the maildev container** to exercise the gate-off arm of the
  `@external` test — shared with the sibling slots.
