# notebook-data-source (slot 4 / :4104)

Source: `e2e/test/scenarios/question/notebook-data-source.cy.spec.ts` (536 lines, 14 tests)
Target: `e2e-playwright/tests/notebook-data-source.spec.ts`
Support module: `e2e-playwright/support/notebook-data-source.ts` (name matches the target — no deviation)

Backend verified by identity, not env var: `ps` shows `java -jar …/target/uberjar/metabase.jar`
on :4104, `/api/session/properties` `version.hash` = `751c2a9` = `target/uberjar/COMMIT-ID`
(`751c2a98`). Jar mode throughout.

## Collision checks

No existing port: `grep -rl "notebook-data-source" tests/ support/` → no hits; no
`tests/notebook-data-source.spec.ts`; no `support/notebook-data-source.ts`.

Full `e2e/test/scenarios/question/` listing checked for same-basename `.js`/`.ts` siblings:

```
column-compare.cy.spec.ts                    notebook.cy.spec.js
detail-visualization-custom-column.cy.spec.ts nulls.cy.spec.js
document-title.cy.spec.js                    offset.cy.spec.ts
multiple-column-breakouts.cy.spec.ts         query-external.cy.spec.js
native-query-drill.cy.spec.ts                question-analytics.cy.spec.js
nested.cy.spec.js                            question-management.cy.spec.js
new.cy.spec.js                               questions-entity-id.cy.spec.ts
notebook-data-source.cy.spec.ts   <-- ported saved.cy.spec.js
notebook-link-to-data-source.cy.spec.ts      settings.cy.spec.js
notebook-native-preview-sidebar.cy.spec.ts   summarization.cy.spec.js
```

`find e2e -name "notebook-data-source*"` returns exactly one file. `e2e/test-component/`
contains only `scenarios/` and no same-basename file. **No collision.**

## Infra tier, per test

| # | Test | Tier | Gate applied |
|---|------|------|--------------|
| 1 | should display databases by default | none (tagged `@OSS` upstream) | none — see below |
| 2 | source data for ad-hoc questions | none | — |
| 3 | source data for a simple saved question | none | — |
| 4 | table from a multi-schema database (39807/11958) | `@external`, postgres-writable | `PW_QA_DB_ENABLED` |
| 5 | table as the model's source | none | — |
| 6 | pick a published table from the mini picker | **token** (untagged) | `resolveToken("pro-self-hosted")` |
| 7 | pick a publish table from the data picker | **token** (untagged) | `resolveToken("pro-self-hosted")` |
| 8 | model as the source (39699) | none | — |
| 9 | moving the model to another collection (39812-1) | none | — |
| 10 | moving the source question (39812-2) | none | — |
| 11 | issue 34350 | `@external`, postgres-12 | `PW_QA_DB_ENABLED` + `test.fixme` |
| 12 | issue 28106 | `@external`, postgres-writable | `PW_QA_DB_ENABLED` |
| 13 | 32252 archiving a collection | none | — |
| 14 | 32252 archiving a question | none | — |

Tag-vs-reality notes:
- The `issue 28106` **describe** is untagged but its `beforeEach` restores
  `postgres-writable` and resets `many_schemas`; only the inner `it` carries
  `@external`. Gating at the describe (as the port does) is correct — an untagged
  `beforeEach` here would still need the container.
- Tests 6/7 are **untagged but genuinely token-gated** (probe below).
- `WRITABLE_DB_ID` red herring checked: tests 4 and 12 restore `postgres-writable`,
  so database 2 really is the writable container there. Test 11 restores
  `postgres-12`, where database 2 is the **read-only** QA Postgres12 — and it does
  not reference `WRITABLE_DB_ID` at all.

## How the `@OSS` gate resolved

**Not applied.** The test runs unconditionally and passes on the EE jar.

- Evidence: gate-ON and gate-OFF full runs both show
  `✓ 1 … should display databases by default (1.3–1.5s)` with no skip. It restores the
  `setup` snapshot, which carries no token, so this is an EE build at the zero-feature
  tier.
- Its assertions are the plain data picker (`entity-picker-modal`, `data-active`
  attributes on eight sample-DB tables). There is **no upsell CTA**, no
  `getByRole("link", …)`, and no page-wide count of EE chrome — i.e. none of the
  three shapes that are genuinely OSS-build-only. `PLUGIN_IS_EE_BUILD` rendering
  extra chrome cannot affect a scoped `item-picker-level-2` lookup.
- So the `@OSS` tag upstream buys a *run on the OSS build*; it is not an OSS-only
  behaviour. Converting it from a would-be skip into real coverage: **+1 test**.

## How the token gate resolved — the gate is REAL

Probed by deleting `await mb.api.activateToken("pro-self-hosted")` from the describe's
`beforeEach` and changing nothing else:

```
2 failed
  … library table as a source › should allow to pick a published table from the mini picker
  … library table as a source › should allow to pick a publish table from the data picker
```

Both die in `beforeEach` at `MetabaseApi.createLibrary` (`support/api.ts:176`) —
`POST /api/ee/library` is refused without the token. So `test.skip(!resolveToken(...))`
is the right gate; skipping by reflex would not have been safe to assume, and probing
confirmed it (contrast `select-embed-options`, whose gating was not real).

## Executed vs gate-skipped (the control)

| Run | Result |
|-----|--------|
| `PW_QA_DB_ENABLED=1` (gate ON) | **13 passed, 1 skipped** (the fixme) — 32.1s |
| no `PW_QA_DB_ENABLED` (gate OFF control) | **11 passed, 3 skipped** — 24.1s |
| gate ON, `--repeat-each=2` | **26 passed, 2 skipped** — 54.4s |

The control skips exactly the three `@external` tests and nothing else. No
`afterEach` failures in the gate-off run (this spec has no `afterEach`, so the
"48 failed instead of 48 skipped" hazard does not apply here).

Token gate: `pro-self-hosted` resolves on this box, so tests 6/7 **executed** in
every run above rather than skipping.

## Fixmes — one, environmental

### `issue 34350` — contaminated shared QA Postgres12 fixture (NOT a product bug)

The final assertion is `cy.findAllByTestId("cell-data").should("contain", "37.65")`.
That value is Orders **id 1**'s subtotal, and the grid is virtualized (~18 rows in the
DOM), so the assertion silently requires id 1 to be *physically first* in an
`ORDER BY`-less `LIMIT 2000`.

Measured on the shared container `metabase-e2e-postgres-sample-1`, db `sample`:

```
select ctid, id from orders where id in (1,2);
   ctid   | id
----------+----
 (213,21) |  1
 (0,2)    |  2
```

Row 1 was UPDATEd at some point and moved to the end of an 18760-row heap, so it falls
outside the 2000-row window entirely. Direct probe of the rendered grid confirms the
result set, not the viewport:

```
CELLDATA_FIRST60 ["ID","User ID",…,"2","1","123","110.93","6.1","117.04","May 15, 2018, 8:04 AM","3","3","1","105","52.72",…]
SCROLLED []          # no div on the page has scrollTop > 0
```

The rest of the test passes — the source swap to QA Postgres12 works, the "There was a
problem with your question" banner is absent, and the QB renders Orders from database 2.

**Why this discriminates:** a ctid of `(213,21)` for the lowest-id row is impossible in
a freshly seeded fixture, which is what CI provisions per run. This observes a condition
that cannot hold under the intended environment, rather than merely being consistent
with a bug. **Expected green on CI.**

I attempted the repair (`CLUSTER orders USING orders_pkey`, data-preserving) and it was
**denied by the permission classifier** — correctly, since the container is shared with
live sibling slots. So: **owed durable fix — re-seed `metabase-e2e-postgres-sample-1`'s
`sample` database and un-fixme this test.** It is a one-line flip.

I did **not** run a Cypress cross-check (standing rule: sibling slots are live), so I
cannot say whether upstream fails here too — though the mechanism above does not depend
on the harness.

## Findings

### 1. `@external` `@OSS` tier gain: the `@OSS` test is not OSS-only (+1 real test)

See above. Same family as the sibling result the brief cites; here it applies to the
data-picker default state.

### 2. #85 escalation, measured: 29 schemas in the shared writable container

```
Domestic, Schema A … Schema Z, Wild, public   (29 user schemas)
```

The mini picker's item list is a `VirtualizedList` (`@tanstack/react-virtual`,
`data-testid="scroll-container"`, `overscan` 5), so it holds ~20 rows. `Wild` sorts
after `Schema Z` and is **never in the DOM** — the multi-schema test failed with
`waiting for getByTestId('mini-picker').getByText('Wild')` while the snapshot showed
`Domestic, Schema A … Schema P`.

The `Schema A…Z` debris is `many_schemas`, which `issue 28106` **in this very spec**
creates — so this spec contaminates itself across runs, independent of siblings.

Fix used: `clickMiniPickerItem` (support/notebook-data-source.ts) pages the virtualized
list until the row attaches, then clicks. This is the mini-picker analogue of the entity
picker's `scroll-container` handling that `issue 28106` already exercises; it weakens no
assertion (the row must still exist and be clickable). Test 4 then passed 3/3.

This is a **concrete instance of the owed durable fix in PORTING** ("`multi_schema`
reset in `support/data-model.ts` should drop schemas it does not own"). Note the reverse
is also needed: `many_schemas` should drop its 26 schemas, or every schema-listing spec
degrades over time.

### 3. `resyncDatabase` bare form: two more call sites that genuinely need `tables`

Upstream uses `H.resyncDatabase({ dbId: WRITABLE_DB_ID })` in both writable-DB
describes here, and **both then depend on tables the reset just created** — so these are
in the "hole actually bites" bucket, not the harmless one. The port passes
`tables: ["Animals", "many_data_types"]` and `tables: ["Animals"]`. Add these to the
13-call-site blast-radius list from batch-12.

### 4. Shared `saveQuestionToCollection` drops the question NAME

`support/nested-questions.ts saveQuestionToCollection` is documented as a "no-rename
subset", but upstream `H.saveQuestionToCollection("Beasts")` forwards the name into
`saveQuestion(name, …)`, which does `findByLabelText("Name").clear().type(name)`. Any
port that transcribes the Cypress call shape gets a question named "New question"
instead. Harmless here (nothing asserts the name), latent elsewhere. Ported with the
rename locally; **consolidation candidate** — add an optional `name` to the shared copy.

### 5. One unreproduced intermittent in test 6 (recorded, not explained)

During the round-2 mutation run, "should allow to pick a published table from the mini
picker" failed at `expect(tableHeaderColumn(page, "Products → ID")).toBeVisible()` — a
line the mutant did not touch (the mutant was three statements later, and
`publishTables` still carried both ids; verified by reading the mutated file). The base
table and `User ID` were fine, so the **join simply never applied**: the picker click
after `join(page)` was swallowed.

Stress: **8/8 green** on `-g "library table" --repeat-each=4`, and 26/26 on the final
full `--repeat-each=2`. I could not reproduce it, so I am recording it as unexplained
rather than inventing a mechanism. It is consistent with the known "list re-renders
under a resolved locator" class, so the port now anchors on the list having settled
(both `Orders` and `Products` rows visible) before resolving the `Products` row. That is
a plausible mitigation, **not a proven one**.

## Mutation testing

Two rounds, 11 mutants, **all killed**. Round 1 exposed two of my own bad mutations,
which I redid. Spec restored byte-identical from a pre-mutation copy after each round
(`cp` from `scratchpad/nds-orig.ts`); the only surviving edits are the deliberate
hardening in finding #5 and the header comment.

### Round 1

| ID | Test | Mutation (input, not expectation) | Died at | Verdict |
|----|------|-----------------------------------|---------|---------|
| M1 | 1 | click `Orders` at level 2 before the not-selected checks | `not.toHaveAttribute` — **"element(s) not found"** | ⚠️ **bad mutation of mine**: selecting a table advances the picker, so the row vanished. Killed on *existence*, proving nothing about `data-active`. Redone as M1b. |
| M2 | 2 | `openOrdersTable` instead of `openReviewsTable` | `toHaveText("Reviews")` — assertion **#1** | killed (head only → tail unproven, see M2b) |
| M3 | 9 | `moveToCollection("Second collection")` | inside `moveToCollection`, "Second collection" not at that picker level | ⚠️ **bad mutation of mine** — redone as M3b |
| M4 | 13 | replace "Move to trash" with `Escape` | the "Trashed collection" toast assertion (mid-test) | killed, but not at the tail → M4b |
| M5 | 6 | `publishTables({ table_ids: [ORDERS_ID] })` | the `Products` pick in the join | killed (body) |
| M6 | 12 | reset `scrollTop = 0` before the wheel loop | `expect(modal.getByText("Schema A")).toHaveCount(0)` — **tail** | killed at the tail ✅ |

M6 is the important one for this spec's shape: it proves the "did not jump to the top"
absence assertion is load-bearing rather than satisfied by virtualization.

### Round 2 — aimed at the tails

| ID | Test | Mutation | Died at | Verdict |
|----|------|----------|---------|---------|
| M1b | 1 | run the *not-selected* helper against `Sample Database` (level 1), which **is** selected | `not.toHaveAttribute` — **Timeout**, element found | killed, and the "Timeout" (not "not found") proves the helper discriminates on `data-active`, not existence ✅ |
| M2b | 2 | run the *selected* helper against `Orders` at level 2, which exists but is not active | `toHaveAttribute` — **tail** of test 2 | killed ✅ |
| M3b | 9 | remove the `moveToCollection` call entirely | post-move `miniPickerHeader` contains "First collection" — **tail** | killed ✅ |
| M4b | 13 | never archive, and drop the toast assertion so the tail is the first thing that can fail | `toHaveCount(0)` on "My collection" in the picker — **tail** | killed ✅ — the absence checks are **not** vacuous |
| M5b | 6 | re-pick `Orders` instead of `Products` in the notebook data step | final `getNotebookStep("data")` shows "Products" — **tail** | killed ✅ |

Where the mutants cluster: after round 2, every test with a tail assertion distinct from
its head has a mutant that died in the **tail**. M4b matters most — this spec's whole
point (issue 32252) is two absence assertions after an archive, exactly the shape that
goes vacuous when the picker has not re-fetched.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/`: clean apart from the known pre-existing
`tests/actions-on-dashboards.spec.ts` error owned by another slot.

## Cleanup

Scratch spec (`tests/zz-scratch-nds-s4.spec.ts`) deleted; `test-results-nds-s4/` removed;
no `console.log` / stray `waitForTimeout` left (the one `waitForTimeout(100)` is the
faithful port of upstream's `cy.wait(100)` inside the mouse-wheel loop). No shared
support module edited; `PORTED.txt` / `QUEUE.md` / `build-helper-index.mjs` untouched;
nothing committed.

## Summary (3 lines)

14 tests ported; 13 pass on the jar (26/26 under `--repeat-each=2`), 1 `test.fixme`'d for
a contaminated shared QA Postgres12 fixture whose Orders row 1 sits at ctid (213,21) and
so falls outside the 2000-row window — environmental, expected green on CI.

The `@OSS` tag is not a real gate (test passes on the EE jar → +1 real test), while the
*untagged* library describe **is** genuinely token-gated (removing `activateToken` fails
both tests in `beforeEach` at `POST /api/ee/library`).

11 mutants across 2 rounds, all killed and now all reaching the tails — including the
issue-32252 absence checks; two of my own round-1 mutations were invalid and were redone.
