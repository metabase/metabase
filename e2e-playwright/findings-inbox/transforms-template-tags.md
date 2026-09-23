# transforms-template-tags — port record (slot 3, :4103)

Source: `e2e/test/scenarios/data-studio/transforms/template-tags.cy.spec.ts` (382 lines, 3 tests, 1 describe)
Target: `e2e-playwright/tests/transforms-template-tags.spec.ts`
Support module: **`support/transforms-template-tags.ts`** — exact basename match with the source spec, as required. Saying it explicitly since the brief asked me to flag any other name: **it is the required name, no deviation.**

## 3-line summary

All 3 upstream `it`s ported in order, all 3 **execute and pass** (9/9 under `--repeat-each=3`, twice); nothing dropped, weakened or merged.
**Both queue gates are wrong**: `snowplow` is dead setup (one `resetSnowplow()`, zero assertions), and `token` is a red herring — a token-OFF control run passes with **0 token features on**, because `query-transforms-enabled?` short-circuits on `is-hosted? = false`.
5 mutations, **all killed at 5 distinct sites**, **no survivors**; 3 presence probes confirm the absence-, toast- and editor-value assertions all discriminate. Container **37 tables before, 37 after, identical listing**.

---

## 1. Collision checks

- `grep -rl "template-tags" tests/ support/` returns ~70 files, but that is the generic term `template-tags` (the MBQL `"template-tags"` key) — **no port of my source spec exists**. Verified by name: `tests/transforms-template-tags.spec.ts` did not exist, and `support/transforms-template-tags.ts` did not exist.
- Landed `transforms-*` work is `transforms.spec.ts`, `transforms-codegen.spec.ts`, `transforms-incremental.spec.ts`, `transforms-inspect.spec.ts`, `transforms-permissions.spec.ts`. Read them; all cover **different** upstream specs. Imported read-only, edited none.
- The brief warned about `native-snippet-tags` / `native-table-tags` — checked both; they port the **question** native editor's snippet/table tags, not the **transform** editor. No overlap.
- Neither `Learn about your data` nor `editor-sidebar` appears in any transforms port (only `bar-chart.spec.ts` / `models.spec.ts`, unrelated). Test 1's surface is genuinely unported.

### 🔴 Cross-slot hazard, found by inventory rather than by reading

The **pre-existing** container inventory already contained `Schema A.transform_table` — a **live sibling fixture** (`tests/transforms.spec.ts`). Upstream's `TARGET_TABLE` is literally `"transform_table"`. Two declared deviations follow, both on **unasserted literals**:

| upstream | ported | why |
|---|---|---|
| `TARGET_TABLE = "transform_table"` | `"tt_tag_target"` | collides with a live sibling fixture; also caught by `support/transforms.ts` `resetTransformTargetTables()`'s `LIKE '%transform%'` DROP sweep, so **any** name containing "transform" is unsafe |
| test 3 types name `"Foo"` | `"TTFoo"` | the save modal auto-derives the target table from the name, so upstream materialises a physical table literally called **`foo`** in the shared container — uncleanable without risking a sibling |

Neither literal is ever read back or asserted. My cleanup drops **two exact table names** and **never a schema** (#85), deliberately avoiding the substring pattern that caused the problem in the first place.

## 2. The token predicate for what MY tests create, and how I traced it

**Traced fresh, not inherited** — the brief records three different answers from neighbouring files, so I re-derived it.

`transforms/crud.clj:40 check-feature-enabled!` → `transforms/util.clj:37 check-feature-enabled`, which **dispatches on source type**:

```clojure
(cond
  (query-transform?  transform) (premium-features/query-transforms-enabled?)
  (python-transform? transform) (premium-features/python-transforms-enabled?)
  :else false)

;; token_check.clj:715
(defn query-transforms-enabled? []
  (and (setting/get :transforms-enabled)
       (or (not (is-hosted?)) (has-feature? :transforms-basic))))
```

**Every transform this spec creates is a `query` transform.** Test 1 never saves one at all; test 2 creates one via `POST /api/transform` with `source.type = "query"`; test 3 creates one through the "SQL query" editor, also `source.type = "query"`. **There is no python anywhere in the file**, so `python-transforms-enabled?` — the branch that genuinely 402s on this box — is **unreachable**. This is the split-by-argument case (#136), landing entirely on the permissive side.

Measured on :4103 (**no token value reproduced**):

```
version.hash 751c2a9   vs   target/uberjar/COMMIT-ID 751c2a98   (identity match, per ps + /api/session/properties)
is-hosted?        false
token features ON 42
transforms-basic  FALSE      <- absent, and never consulted
transforms-python true
```

End-to-end probe against `WRITABLE_DB_ID = 2`, before writing a line of the port:

```
PUT  /api/setting/transforms-enabled {"value":true}            -> 204
POST /api/testing/native-query {database:2, query:"SELECT 1"}  -> 200
POST /api/transform (source.type "query", table target)        -> 200
POST /api/transform/:id/run                                    -> 202, last_run.status "succeeded"
DELETE /api/transform/:id/table -> 204 ; DELETE /api/transform/:id -> 204
```

### 🔴 The `token` gate is a RED HERRING — and I have the control run to prove it

I removed `activateToken("pro-self-hosted")` from the beforeEach (anchored replace, count-1 asserted, read back) and re-ran:

```
3 passed (46.0s)
token-features after the run:  features ON: 0        is-hosted?: False
```

**All three tests pass with zero token features active.** Per the brief's correction, `ON (0)` means no token was ever activated — which is exactly the state I engineered. The upstream `H.activateToken` call is **inert on a non-hosted instance**. It is nonetheless **kept in the port** (faithfulness: dropping setup is dropping a precondition, and it would be load-bearing on a hosted instance where the `or` cannot short-circuit).

### A near-miss worth recording

The EE frontend sets `PLUGIN_TRANSFORMS.isEnabled = !!hasPremiumFeature("transforms-basic")` (`enterprise/frontend/src/metabase-enterprise/transforms/index.ts:9`), and `transforms-basic` is **false** here. That looked like it would render the transforms **upsell page** instead of the editor and sink the whole file. It does not: grepping every reader of that flag finds exactly **two** call sites — `SmartLinkNode.tsx:346` and `DataPermissionsHelp.tsx:203`. Neither is on the Data Studio transform routes; `frontend/src/metabase/transforms/routes.tsx` gates only the **python** routes/tabs, via the separate `PLUGIN_TRANSFORMS_PYTHON`. Recorded because "the flag is false" is true while "the flag blocks this spec" is not — and I would have banked the wrong conclusion had I stopped at the assignment.

## 3. Gate mapping, with the gate-OFF control

Upstream has **one describe and no tags at all** — no `@external`, no `@python`, nothing. The only gate is the harness's QA-DB tier, applied per-describe via `test.skip(!process.env.PW_QA_DB_ENABLED)`.

| test | upstream tag | gate ON | gate OFF |
|---|---|---|---|
| data reference and snippets in a SQL transform | — | **executed ✓** | skipped |
| use template tags in SQL transform | — | **executed ✓** | skipped |
| add multiple template tags | — | **executed ✓** | skipped |
| **total** | | **3 executed, 0 skipped** | **0 executed, 3 skipped** |

**Gate-OFF control run: `3 skipped`, zero executed.** Gate-ON: `3 passed`. The difference is **exactly** the three tests, so the green run is not a green-because-skipped run.

**Upstream tagging drift, flagged:** this file restores `postgres-writable`, resets `many_schemas` and drives `WRITABLE_DB_ID` exactly as `transforms.cy.spec.ts` and `transforms-indexes.cy.spec.ts` do — and *those* carry `@external`. This one carries **no tag**. Same "missing, not absent-by-design" drift the `transforms-incremental` sibling recorded, now seen twice in the same directory.

## 4. Snowplow — neither vantage, because the tag is DEAD SETUP

The queue tags this file `snowplow`. **I checked for real assertions before choosing a vantage, per the brief, and there are none.**

```
$ grep -n "snowplow\|resetSnowplow" .../template-tags.cy.spec.ts
14:    H.resetSnowplow();
```

**One line, in the beforeEach.** No `expectUnstructuredSnowplowEvent`, no `expectGoodSnowplowEvents`, no `expectNoBadSnowplowEvents`, and **no `afterEach` at all**. The reset has no consumer.

So the FE-vs-backend question does not arise: **neither** `installSnowplowCapture` nor the per-slot collector is installed, because there is nothing to observe. Installing either would be pure ceremony and would add a real cost — the browser-boundary capture must be installed before the first navigation and intercepts tracker POSTs, which is a behaviour change in exchange for zero assertions.

Consequently the two known collector/capture defects the brief lists (**the collector's missing `Access-Control-Allow-Credentials` making it blind to FE events**, and **backend events being queued at a persistent offset so a test can pass on its predecessor's event**) are **inapplicable here, not banked**. Neither could be exercised by this file.

## 5. Mutation testing — 5 mutations, 5 kills at 5 distinct sites, 0 survivors

Every mutation inverts an **input**, never an expectation. Every one was applied with an **anchored replace asserting `count == 1`** and then **read back from disk** before running (the helper aborts otherwise) — the brief's silent-clobber failure mode was designed out rather than watched for.

| # | Mutation (input) | Result |
|---|---|---|
| **M1** | Never set the default value — `setDefaultValue()` for the `text` tag becomes a no-op | **KILLED** at spec:310 `expect(saveButton).toBeEnabled()` |
| **M2** | Remove the template tag entirely: `SELECT {{ text }}` → `SELECT 1 /* text */` | **KILLED** at spec:281 — no "Variable type" control exists at all |
| **M3** | Break the run: field-filter query targets `"Schema A"."NoSuchAnimals"` | **KILLED** at the run assertion, `Received: "Run failed"` |
| **M4** | Only ONE template tag in test 3 (`score > {{ min_score }}` → `score > 5`) | **KILLED** at spec:476 `toHaveCount(2)` — `Expected: 2, Received: 1` |
| **M5** | Snippet content `'foo'` → `'bar'` | **KILLED** at spec:237, the preview-modal assertion |

Five kills at five different assertions — the mutants are not all dying at one over-broad gate. **M3 is the important one**: it proves `assertIsTransformRunnable` is a real end-to-end check, observing the app report `"Run failed"` rather than merely timing out.

### Presence probes on the three assertions most at risk of being vacuous

A survivor is a question; here there were none, so I instead interrogated the assertions a mutation *couldn't* reach.

| probe | question | answer |
|---|---|---|
| **P1** | Is `assertNoParameterSettingsAreVisible` (five `not.exist` checks) vacuous? | **LIVE.** Substituting a string that IS in the sidebar fails with `Expected: 0, Received: 1` |
| **P2** | Does the first-save toast assertion discriminate, or would any toast pass? | **LIVE.** Expecting the *success* text on the *error* toast fails |
| **P3** | Is my `nativeEditorValue` helper whitespace-**exact**, as its docstring claims? | **LIVE and exact.** One extra space fails: `Expected "{{snippet:  snippet1}}", Received "{{snippet: snippet1}}"`. A normalizing matcher would have passed — so the "use raw `textContent`, not `toHaveText`" reasoning is evidenced, not asserted |

### Bad mutations I ruled out, called out per the brief

- **"Pick `Text` instead of `Number` for the number tag"** — rejected before running. `SELECT {{number}}` with a Text tag and default `"42"` renders `SELECT '42'`, which is still valid SQL that runs fine. The data **cannot discriminate**; it would have been a survivor that said nothing about the test.
- **"Rename the tag in the query but not in the sidebar"** — rejected: the sidebar derives its tags *from* the query, so the mutation is a no-op by construction.
- **"Rename the snippet to `snippet1a`"** — rejected in favour of M5. It kills, but at the *sidebar* lookup, which M5's kill site (the preview modal) already dominates; it would not have isolated anything new.

**Both files restored byte-identical**, md5-verified against a baseline taken before the first mutation:
`tests/…spec.ts` → `4fd1108a842f34b514f670cb71721eff` ✓ · `support/…ts` → `0b4d670e71966d564e522c498740b3d3` ✓
(The support module was subsequently edited **once more**, deliberately, to drop an unused `queryEditor` alias export — see §7.)

## 6. Fixes needed while stabilising (all port drift — my bug, not the app's)

Three failures, all diagnosed to port drift, consistent with the standing strong prior.

### 🔴 6.1 — `getByText(..., { exact: true })` vs testing-library, and **the brief has this backwards**

Run 1 died at the `"Default value"` lookup. The DOM is:

```html
<div>Default value<span>(required)</span></div>
```

- **testing-library** (`H.findByText`) matches this. Its matcher runs against `getNodeText(node)`, which concatenates only the node's **direct child text nodes** — the `(required)` span is invisible to it.
- **Playwright** `getByText(..., { exact: true })` compares the element's **full normalized `textContent`**, which is `"Default value (required)"` — so it matches nothing.

The brief states this hazard **the other way round** (Playwright doing direct-child text nodes, Cypress doing full textContent). **On the evidence of run 1's call log, it is inverted.** Recorded as a correction.

Fixed by adding `directText()` — an XPath matcher (`.//*[normalize-space(text()) = "…"]`) that reproduces testing-library's semantics. It **cannot** match an ancestor, since an ancestor's `text()` excludes descendants' text, so it is precise rather than merely permissive. Applied to **all** `findByText` ports including the `not.exist` ones — a narrower matcher on an absence assertion would pass *more* easily than upstream's, which is the one direction that must not drift. Known gap stated in the docstring: XPath 1.0's `text()` in a comparison takes the *first* direct text node where testing-library joins all of them; no label in this spec has text nodes on both sides of a child.

### 6.2 — The database picker popover auto-closes (confirms the sibling's finding, with new corroboration)

Upstream's `H.popover().findByText(DB_NAME).click()` cannot be ported literally. Run 1's call log: the locator **resolved** to the "Writable Postgres12" list item, then `element was detached from the DOM, retrying`, and the popover never returned — 30s of losing the same race. Only one database here is eligible (the Sample Database is rejected outright by `crud.clj`), so the app auto-selects it.

**New corroboration the sibling didn't have: upstream contradicts itself.** Its own test 3 clicks "SQL query" and then types straight into the editor, **never picking a database** — and that test passes here, successfully querying `"Schema A"."Animals"` in the writable DB. So the database really is pre-selected and upstream's click in test 1 is vestigial (or its CI has a second eligible database).

Ported as an assertion on the state the click exists to establish (`toContainText(DB_NAME)` on the top bar). Not a weakening: a second eligible database being auto-selected wrongly now fails loudly. **NOT cross-checked against Cypress** (standing rule), so whether upstream races this too is **unknown** and is not claimed.

### 6.3 — `cy.icon("snippet").click()` targets an icon that Playwright's own hover removes

`SnippetRow.tsx` renders **two** icons inside one clickable `Flex`:

```jsx
<Flex onClick={insertSnippet}>                              // :57 — the handler
  <Icon name="snippet"            className={hoverChildHidden} />   // :68
  <Icon name="arrow_left_to_line" className={hoverChild}     />     // :76
```

The `snippet` icon is the **non-hover** state. Playwright hovers as part of actionability, so its target is swapped out from under it — run 2 recorded `arrow_left_to_line … subtree intercepts pointer events` followed by 60+ retries of `element is not visible`. Cypress never hits this because it does not hover-then-wait-for-stability before dispatching.

Fixed by clicking the icon's **parent**. That is not a workaround but where the Cypress click actually lands: the icon has no handler of its own, so upstream's click only ever does anything by **bubbling** to that `Flex`. Same element, same handler, independent of which icon is currently painted.

## 7. Deliberate deviations, consolidated

1. `TARGET_TABLE` `"transform_table"` → `"tt_tag_target"` (§1) — unasserted literal.
2. Test 3's transform name `"Foo"` → `"TTFoo"` (§1) — unasserted literal.
3. DB-picker click → state assertion (§6.2) — measured, not preferred.
4. Snippet icon click → its handler-bearing parent (§6.3) — same event target.
5. `directText` in place of `getByText(exact)` (§6.1) — **closer** to upstream, not looser.
6. `H.NativeEditor.value()`'s `cy.get(".cm-line")` re-queries from the document root and discards its `.cm-content` subject (the "helper discards its arguments" hazard). There is exactly one CodeMirror on this page so the sets are identical; the port scopes to the editor, which is what upstream *means*. Noted, not hidden.
7. Seven of the eight `cy.intercept` aliases are **never awaited anywhere in the file** and are dropped (PORTING rule 2). The one kept, `@updateTransform`, is registered **before** each triggering click — `cy.wait` is a queue that can pop a past response, so registering after would race.
8. Upstream's `getRunButton({ timeout })` threads a timeout into `.eq(0)`, where it has no effect (`.eq` is a query, not a retried assertion). Dropped as inert; the equivalent headroom is an explicit `toHaveText(..., { timeout })`.

**Nothing was strengthened without saying so**, and no upstream assertion was dropped, merged or weakened.

## 8. Brief hazards that did NOT apply (reported as inapplicable, not banked)

- **The entire CodeMirror hazard class** — `interactionDelay`, Enter-as-completion-accept, refused-Enter-inserts-newline, the tooltip-DOM-is-not-a-gate, `toPass` being unsafe. All three `type()` calls here use `{ allowFastSet: true }`, which **does not type**: it writes `.cm-content.textContent` directly and then types `" {backspace}"` to re-trigger the validator. No keystroke ever reaches the autocomplete, so the hazard is **structurally absent**, not merely avoided.
- **`pressSequentially` after `fill()` prepends** — real, and designed out rather than hit: `typeAppend()` does click + `End` + `pressSequentially`, reproducing Cypress `.type()`'s append semantics. This mattered concretely — test 3 types into the save-modal name field **twice** (the first attempt is cancelled with "Back"), so `fill()` would have papered over whether the field retains its value.
- **Toast strict-mode violations** — real and pre-empted: `dismissUndoToast` gates on `toHaveCount(0)` rather than loosening to `.first()`. This spec dismisses up to two toasts per sub-scenario across six sub-scenarios, so it would have fired on nearly every run.
- **`.contains()` resolving to the innermost descendant**, **`should("not.have.value")` tautologies**, **`be.empty` on an input**, **DOMRect `deep.eq`**, **`cy.intercept(…, {statusCode:500})` empty bodies**, **placeholder traps**, **empty-state-as-anchor** — none of these shapes occur in this spec.
- **localstack :4566 / python 402** — no python transform in this file; unreachable.
- **The 1280×720 harness viewport defect** — no failure here was layout-dependent. §6.2 is a *lifetime* race (the popover closes) and §6.3 is a *hover-state* swap; both were diagnosed to a specific mechanism, neither attributed to viewport.

## 9. Verification summary

- Jar verified **by identity**: `/api/session/properties` `version.hash = 751c2a9` vs `target/uberjar/COMMIT-ID = 751c2a98`. `is-hosted? = false` confirmed on the slot (the load-bearing fact for §2).
- Final runs: **3 passed**; `--repeat-each=3` → **9 passed**, run twice (before and after the §7 cleanup). No order dependence and no flake observed.
- `bunx tsc --noEmit`: **clean for my two files.** Sibling in-progress errors present and not mine.
- **Dead imports checked by hand** (tsc misses them): every imported name in the spec is referenced beyond its import line. One **unused export** (`queryEditor`) was found in the support module by the same sweep and removed, with the upstream-helper mapping kept as a comment. No `waitForTimeout`, `console.log`, `.only`, or debug code in either file.
- **Container inventory: 37 tables before, 37 after — the two listings are identical.** `tt_tag_target` and `ttfoo` remaining: **0**. Foreign fixtures `Schema A.transform_table` and `Schema A.inspect_sql_table` **untouched** (#85 respected — the sweep drops two exact names and never a schema). **Net footprint: zero.**
- Scratch files all prefixed `s3-` and removed. Did **not** touch `PORTED.txt`, `QUEUE.md`, `playwright.config.ts`, or any shared support module. Did not commit. Never contacted port 4000.
- **No Cypress cross-check was run** (standing rule) — so for every failure in §6, "upstream also fails/passes" is **unknown**, and nothing here is claimed as a product bug.
