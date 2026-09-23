# data-model-shared-2

Port of `e2e/test/scenarios/data-model/data-model-shared-2.cy.spec.ts` (974 lines)
→ `tests/data-model-shared-2.spec.ts` + `support/data-model-shared-2.ts`.

23 tests × 2 areas (`admin`, `data studio`) = 46 cases.

## Collision checks

- Source dir `e2e/test/scenarios/data-model/` holds only `.ts` specs
  (`data-model-shared-1..4.cy.spec.ts`). **No same-basename `.js` twin** — the
  hazard that nearly overwrote a landed port on `visualizations-charts-reproductions`
  does not apply here.
- `tests/` had **no** `data-model-shared-2.spec.ts`. The landed neighbours
  (`data-model-shared-1`, `datamodel-data-studio`, `datamodel-segments`,
  `admin-datamodel`, `data-model-permissions`) all derive from different sources.
  No port of this source existed.

## Infra tier — checked per describe, not per tag

**This spec's tags are ACCURATE in both directions**, which is worth recording
because it is the opposite of its direct sibling. `data-model-shared-1` carried
an untagged mysql-8 test; here every container-dependent test is tagged and
every tagged test really needs a container.

| Tests | Snapshot | Container |
|---|---|---|
| 21 × 2 = 42 | `default` | **none** — Sample Database only |
| "should show an error with links to other fields with 'Entity name' semantic type" (`@external`) × 2 | `postgres-writable` + `resetTestTable(many_data_types)` | `postgres-sample` (writable_db on :5404) |
| "should be able to select and update a field in a database without schemas" (`@external`) × 2 | `mysql-8` | `mysql-sample` (:3304) |

So 4 of 46 cases are QA-DB; the other 42 run on the bare jar.

## Executed vs gate-skipped

- `PW_QA_DB_ENABLED=1`: **46 passed** (2.4m), 0 skipped.
- Gate-OFF control (same command, var removed): **42 passed, 4 skipped**, no
  `afterEach` fallout. (The known trap — an `afterEach` failing every test in a
  gate-off control — does not fire here: the snowplow `afterEach` only reads a
  capture created in an ungated `beforeEach`.)
- `--repeat-each=2`: see below.
- Backend verified as jar mode: `/api/session/properties` `version.hash` =
  `751c2a9` == `target/uberjar/COMMIT-ID` `751c2a98`, `ps` shows `metabase.jar`.

## Findings

### 1. 🔴 The SHARED `verifyAndCloseToast` (support/data-model.ts) is a latent strict-mode violation — measured, not theorised

`support/data-model.ts:235` does `expect(undoToast(page)).toContainText(message)`.
`undoToast` is `getByTestId("toast-undo")`, which matches **every** toast. On
"should allow to enable, change, and disable coercion strategy" — four toasts in
quick succession — the outgoing "Casting updated for Rating" toast is still in
the DOM when "Casting disabled for Rating" arrives, and the helper died with a
strict-mode violation in **both** areas on run 1.

Upstream is `undoToast().should("contain.text", msg)`, which on a multi-element
subject is chai-jquery's **CONCATENATION** — so it passes there regardless. Note
what that means: Cypress's own follow-up `undoToast().icon("close").click()`
*would* have errored on two elements, so upstream only ever survives because its
pacing lets the exit animation finish first. The assertion was never doing the
disambiguating work; the timing was.

Ported here as a spec-local `verifyAndCloseToast` that (a) keeps the
concatenation semantics (join all toasts, poll, `toContain`) and (b) closes the
toast that actually carries the message, via `dispatchEvent("click")` rather
than `click({ force: true })` — the shared helper's force-click is the exact
construct PORTING records as having closed a modal in another port.

**Blast radius**: the shared helper is imported by `data-model-shared-1` (and is
the canonical `Shared.verifyAndCloseToast` port). It has not bitten there because
that spec never fires two toasts inside one animation window. It is a flake
waiting for CI load. Consolidation candidate: promote the version in
`support/data-model-shared-2.ts`.

### 2. 🔴 FINDINGS #85 debris breaks `visitDataModel`'s own wait gate, not just the picker

New concrete instance of the shared-writable-container problem, and a different
mechanism from the virtualization one already recorded.

`visitDataModel(page, area, { databaseId })` defaults to waiting for
`["databases", "schemas", "schema"]`. The `GET /api/database/:id/schema/:name`
request **only fires when a schema auto-expands**, and
`TablePicker/hooks/useTableLoader.ts:138` auto-expands only when
`schemas.length === 1`. The shared writable postgres currently has **29 schemas
/ 34 tables** (measured directly:
`Domestic`, `public`, `Schema A`…`Schema Z`, `Wild`), so nothing auto-expands,
no `/schema/` request is ever sent, and the helper burns its 30s timeout on a
page that has rendered perfectly.

Fingerprint is misleading: it fails inside the *shared, correct* visit helper
with `page.waitForResponse: Timeout`, which reads as "the page didn't load".

Ported with an explicit `waitFor: ["databases", "schemas"]` plus a conditional
"expand `public` if schema nodes are present" branch. On a clean container
(CI) the single schema renders **no schema node at all**, so `count()` is 0 and
the branch is a no-op — the test is unchanged there.

### 3. The table picker renders the RAW schema name — `public`, not `Public`

Cost 30s × 2 before I read the source. `useTableLoader.ts:132` and
`useSearch.ts:57` both set `label: schemaName` with no humanization, so the tree
row reads `public`. `TablePicker.getSchema` filters with a **case-sensitive**
regex (mirroring Cypress's `:contains`), so `"Public"` matches nothing.

This is invisible in every existing data-model port because the only schemas
they name — `Domestic`, `Wild` — happen to be capitalized in the DB. Anyone
porting a spec that touches a lowercase schema (`public` being the common one)
will hit it.

### 4. The snowplow browser capture is now reused, unmodified, on a 5th spec

Four tests here assert real `metadata_edited` events (`type_casting`,
`semantic_type_change`, `visibility_change`, `filtering_change`), each with an
`event_detail` + `triggered_from` matcher whose value differs per area
(`admin` / `data_studio`). PORTING rule 6's no-op stub would have made all four
vacuous. `installSnowplowCapture` from `support/search-snowplow.ts` worked with
**zero modification** — no container, and the `triggered_from` discrimination is
real (proved by mutation M4 below).

**Recorded gap, unchanged from search-snowplow**: `H.expectNoBadSnowplowEvents`
asks snowplow-micro for Iglu *schema-validation* failures. The port degrades it
to the structural check, so "the FE emits a field the schema rejects" is not
caught. That afterEach is smoke coverage only in this port and must not be read
as a passing schema assertion.

### 5. No token-feature gap encountered

The brief flagged that the local `MB_PRO_SELF_HOSTED_TOKEN` lacks
`transforms-basic`. Nothing in this spec is gated on a post-0.57 feature — the
only token dependence is `activateToken("pro-self-hosted")` for the data-studio
area to exist at all, and all 23 data-studio tests execute and pass. No empty
feature-gated surface was observed, so there is nothing to report on that axis
here.

## Mutation testing

Four mutants, deliberately aimed at *different* assertion positions after the
first one died at the tail. Every mutant inverts an INPUT, never an expectation.

| # | Mutation | Result | Died at |
|---|---|---|---|
| M1 | Widen the `fieldValuesRecorder` predicate from `GET /api/field/:id/values` to **all** `GET /api/field/:id*` | **SURVIVED** | — |
| M1b | Widen it further to `GET /api/table/:id/query_metadata` (a request known to fire) | **KILLED** — recorder collected 3 URLs | the `toEqual([])` assertion |
| M2 | `getTriggeredFromArea` always returns `"admin"` | **KILLED** — all 4 *data studio* snowplow tests failed; the 4 admin ones correctly unaffected (no-op there) | the `expectUnstructuredSnowplowEvent` in each |
| M3 | Currency test picks **Euro** while the assertions still expect `Tax (CA$)` | **KILLED** | spec:699 — the **second** `verifyTablePreview`, i.e. the tail, *after* two generic "Semantic type of Tax updated" toasts had passed |
| M4 | "Do not include" test picks **Only in detail views**, with the two mid assertions neutralised so the run reaches the end | **KILLED** | spec:1044 — the **final** object-detail modal absence assertion |

### M1's survival: bad mutation, not vacuity

This is the one that needed the "vacuous, or bad mutation?" follow-up. M1
survived, which looks exactly like a vacuous absence check. M1b answers it by
asserting **presence** through the same recorder: with the predicate pointed at
`query_metadata` the recorder captured 3 real requests, so the `page.on("request")`
plumbing, URL parsing and timing are all sound and the empty result is a
**genuine absence**.

The incidental measurement is worth keeping: the whole field-values flow
(open Field values modal → Discard cached field values → wait for the button to
settle) issues **zero** `GET /api/field/:id…` requests of any shape — not just
zero `…/values`. Field metadata reaches the FE via `/api/table/:id/query_metadata`.
So #62626's regression surface is genuinely covered by this assertion.

### Where the mutants died matters here

M3 and M4 both sailed past the generic `verifyAndCloseToast("… updated")`
checkpoints — those toasts carry no discriminating information, since every
visibility/semantic-type change produces the same string. The assertions doing
the real work are the preview content and the viz/object-detail checks at the
tail, and both were confirmed load-bearing. Had I only run a mutation that dies
at assertion #1, that would have been left unproven.

## Fixmes

None. All 46 cases execute and pass; nothing was weakened, dropped, or merged.

## Verification summary

- `tsc --noEmit` (from `e2e-playwright/`): clean.
- Full run, gate ON: **46 passed** (2.5m), 0 skipped.
- Gate OFF control: **42 passed, 4 skipped**, no `afterEach` fallout.
- `--repeat-each=2`, gate ON: **92 passed** (4.9m).
- Backend: jar mode, `version.hash 751c2a9` == `COMMIT-ID 751c2a98`, `ps` shows
  `metabase.jar`. **Caveat (#79/#43)**: CI builds a merge with master, and this
  spec pins sample-derived values (`2.07 / 6.1 / 39.72 / 117.03`, the coerced
  `December 31, 1969, 4:00 PM`, table/field counts). That is precisely the class
  that drifts against a freshly-built CI jar, so a CI-only failure on one of
  those literals should be read as data drift before port drift.
- **No Cypress cross-check was run** — sibling slots were live, and the standing
  rule forbids it. Nothing in this port rests on a cross-check: there are no
  fixmes and no product-bug claims.

## Assertions ported with deliberate care (semantics that don't survive a naive port)

- `cy.get("@fieldValues.all").should("have.length", 0)` (#62626) and the two
  `cy.get("@dataset.all").should("have.length", 0)` visibility assertions →
  passive `page.on("request")` recorders installed **before** the triggering
  navigation/click, asserted after. A `waitForResponse` cannot express "this
  never fired".
- `cy.wait(["@metadata", "@metadata"])` → a retroactive response **counter**
  polled to `>= 2`. Two concurrent `waitForResponse`s on one predicate both
  resolve on the first hit.
- `cy.findAllByTestId("cell-data").contains(text).should("have.length.greaterThan", 0)`
  — `.contains()` yields the FIRST match, so the length assertion is trivially
  true and the real content is "at least one cell contains the text". Ported as
  existence of `.first()`, with the analysis inline. (Upstream assertion is
  weak; not strengthened, since the intent is genuinely just presence.)
- `expect(rect.top).greaterThan(0)` / `expect(rect.bottom).lessThan(400)` read
  via `evaluate(el => el.getBoundingClientRect())`, not `boundingBox()` — the
  latter is a second round trip that returns `null` on re-render.
- Mantine `Select` searches (`type("no sema{downarrow}{enter}")`) are gated on
  the filtered option being visible before `ArrowDown`, because the option list
  is recomputed asynchronously and the selection resets to index 0 mid-sequence.

## Deviations from upstream, stated explicitly

1. Spec-local `verifyAndCloseToast` (finding 1) — assertion semantics preserved,
   close targeting made deterministic.
2. `waitFor: ["databases", "schemas"]` + conditional `public` expansion on the
   writable-DB test (finding 2) — a contaminated-container accommodation that is
   a no-op on a clean one.
3. `page.mouse.move(2, 2)` before `keyboard.press("Escape")` in the field-values
   test — Playwright parks the real cursor over the button it just clicked, and
   a tooltip rendered there swallows the first Escape (PORTING wave-9). Cypress's
   synthetic click never moved the cursor.
