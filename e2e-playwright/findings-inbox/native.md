# findings — native.spec.ts (port of e2e/test/scenarios/native/native.cy.spec.js)

Slot 1 (:4101), jar mode. Jar confirmed: `target/uberjar/COMMIT-ID` = `751c2a98`,
`GET /api/session/properties → version.hash` = `751c2a9`. (The run log printed
`(reused)` — the hash check is what proves the artifact, per the
`PW_KEEP_SLOT_BACKENDS` trap.)

## Collision checks

- **Source dir `ls`**: `native-database-source.cy.spec.ts`,
  `native-reproductions.cy.spec.js`, `native-reproductions.cy.spec.ts`,
  `native.cy.spec.js`, `native_subquery.cy.spec.js`, `snippet-tags.cy.spec.ts`,
  `snippets.cy.spec.js`, `suggestions.cy.spec.ts`, `table-tags.cy.spec.ts`.
  The disjoint `.js`/`.ts` pair the brief warned about is
  **`native-reproductions`** — confirmed. **My source `native.cy.spec.js` has no
  same-basename `.ts` sibling**, so `tests/native.spec.ts` is unambiguous.
- **`e2e/test-component/`** contains only `scenarios/embedding-sdk` — no
  `native*` basename.
- **`ls tests/`**: no `native.spec.ts` existed. Existing native ports
  (`native-reproductions`, `native-reproductions-js`, `native-subquery`,
  `native-snippet-tags`, `native-query-drill`, `native-table-tags`,
  `native-sql-generation`, `native-filters-reproductions`,
  `native-filters-remapping`, `native-suggestions`, `embedding-native`) are all
  ports of *other* sources. No collision.
- **Support module name: `support/native.ts`** — the default the brief asked
  for. No deviation to flag, and no shared module was edited.

## Infra tier — this is the container-free tier (with 2 gated mongo tests)

The brief warned tags mislead four ways. Result for this spec:

| Class | Present here? |
| --- | --- |
| Missing tag | **No.** Only the 2 mongo tests touch a container, and both are tagged `@mongo`. |
| Over-broad tag | **No.** |
| Stale tag | **No.** |
| Red-herring `WRITABLE_DB_ID` | **Yes — confirmed exactly as described.** |

- `describe("scenarios > question > native")` — default snapshot, 19 of 21
  tests need nothing. The two `@mongo` tests restore `mongo-5` and pick the
  "QA Mongo" database; `e2e/snapshots/mongo_5.sql` exists and the
  `mongo-sample` container is up, so **both actually execute** under the gate.
- `describe("no native access", { tags: ["@external", "@skip"] })` — `@skip`,
  i.e. never runs upstream. Ported as `test.describe.skip`.
  **Its `WRITABLE_DB_ID` (= 2) references are the red herring**: the describe
  restores `postgres-12`, under which database 2 is the *read-only* "QA
  Postgres12" sample, not the writable container. So **#85 writable-container
  debris does not apply anywhere in this spec** — nothing here lists schemas,
  pins a table lookup, or drives a virtualized picker over the writable DB. No
  `visitDataModel`, no `resyncDatabase`.
- `describe("scenarios > native question > data reference sidebar")` — default
  snapshot, no containers.

## Executed vs gate-skipped

| Run | Result |
| --- | --- |
| `PW_QA_DB_ENABLED=1`, run 1 | **28 passed, 2 skipped** (30 total) |
| `PW_QA_DB_ENABLED=1`, `--repeat-each=2` | **56 passed, 4 skipped** |
| **Gate-OFF control** (no `PW_QA_DB_ENABLED`) | **26 passed, 4 skipped** — clean skip, no failures |

The gate-off delta is exactly the 2 mongo tests. There is no `afterEach` in
this spec, so the "afterEach runs through a skipped beforeEach" failure mode
does not apply.

`test.fixme` count: **0**. No product-bug claim is made anywhere in this port.

## Notes worth keeping (mechanism, not speculation)

### 1. `H.NativeEditor.type("[{enter}{ {enter}\"foo\"…")` hides a literal SPACE

The mongo indentation test's typed string does **not** expand the way it reads.
`codeMirrorHelpers.type` splits on `/(\{[^}]+\})/`, and that regex swallows
`{ {enter}` as **one** token (`[^}]+` matches ` {enter`). It is not a known
escape, so the helper falls through to
`insert("{"); insert(part.slice(1))` → `realType("{")` then
`realType(" {enter}")`. cypress-real-events' `realType` *does* parse `{enter}`
as a key (it is in `keyCodeDefinitions`), so the true keystroke sequence is:

```
[  Enter  {  SPACE  Enter  "foo": "bar",  Enter  "baz"
```

A naive port that reads the string as `[`, Enter, `{`, Enter, … drops the
space. Verified empirically: with the space reproduced, all six line
assertions pass, and line 1 reads `  {` — CodeMirror's newline-in-brackets
handling strips the trailing space, which is why the space is invisible in the
expected output and easy to lose.

This is a fourth instance of the "read the Cypress helper before porting its
call shape" family (#25, #53) — here the helper's *string parser*, not its
signature.

### 2. `toHaveText` would have silently passed four of these assertions

Four assertions in this spec are `should("have.text", …)` on CodeMirror with
**tab characters** (`"SELECT\t"`, `"\tSELECT"`, `"\tSELECT\tFOO"`, and the
mongo `"  "`). Playwright's `toHaveText` normalizes whitespace, so
`"\tSELECT\tFOO"` would compare as `"SELECT FOO"` — the ports would be green
while asserting nothing about indentation, which is the entire subject.
`support/native.ts expectEditorTextContent` / `expectLineTextContent` compare
raw `textContent()` inside `expect.poll` instead. **Proved strict** by the
`Tab`→`Space` mutants B13/B16 (see the control-probe note at the end of the
mutation section) — under `toHaveText` those mutated inputs compare *equal* to
the expected values.

Generalises: **any port of a `have.text` assertion whose expected value
contains a tab, a leading/trailing space, or a run of spaces must not use
`toHaveText`.** Worth a sweep over landed CodeMirror/indentation ports.

### 3. Two added anchors, both against measured-vacuity risk

- `metrics › should not show metrics when they are not defined on the selected
  table` asserts `findByText(/metric/).should("not.exist")` **immediately
  after** clicking ORDERS in the data-reference sidebar — i.e. it is satisfied
  by "the table detail has not rendered yet". Added an anchor on
  `"9 columns"` (loaded-state only) before the absence check. Mutation M7
  confirms the absence check is now load-bearing.
- The two-sidebars test's `should("not.be.visible")` round-trip: anchored the
  *visible* state before asserting hidden.

Both are the sanctioned anti-vacuity strengthening, called out inline in the
spec header.

### 4. `should("not.be.visible")` here is NOT the occlusion case

`expectCypressHidden` (support/question-reproductions-4.ts) was the right port:
the collapsed `sidebar-right` has a zero-extent box, so the
display/visibility/opacity/zero-box branch fires. The sticky-element occlusion
branch the brief warns about (`elementFromPoint`) is not needed here. Mutation
M8 confirms the assertion fails when the sidebar is left open.

### 5. Upstream oddity recorded, not fixed

`shows format query button only for sql queries` (inside the `@skip` describe)
asserts on `.ace_line`. The editor is CodeMirror — `.ace_line` matches nothing,
and `H.NativeEditor.get(".ace_line")` **discards its argument** anyway, so
`cy.get("@lines")` was really a page-wide `cy.get(".ace_line")` resolving to
zero elements. Since the describe is `@skip` upstream it has never run against
the current editor. Ported verbatim with the analysis inline rather than
"fixed" — it is skipped in both harnesses, so silently rewriting it would
invent coverage nobody has validated.

### 6. Redundant in-test `restore()` kept

`should be possible to format the native query using the keyboard shortcut`
repeats `H.restore()` + `cy.signInAsNormalUser()` that its own `beforeEach`
already ran. Ported verbatim (faithfulness); it costs ~1s on the jar.

## Things the brief warned about that did NOT bite here (recorded so the next
## agent doesn't hunt for them)

- **`{Enter}` as a completion accept**: this spec's `{enter}` occurrences are
  in the mongo JSON test and the newline-indent test, where **no completion
  tooltip is open** — they are genuine newlines. The completion-accept rule
  does not apply. (It very much does in `native-suggestions`/`native-subquery`.)
- **`Mod-j` first-press refusal**: no `{nextcompletion}` in this spec.
- **Placeholder trap**: real and handled — all four
  `input[placeholder*=…].type()` sites go through `clickAndType`
  (resolve once → click → `keyboard.type`, never re-resolve). No failure was
  observed, so I cannot claim it *would* have bitten; the shape is defensive.
- **Saved-vs-adhoc endpoint split**: the only saved-question run in this spec
  is `visitQuestion` on cards that load clean, so the plain shared
  `visitQuestion` works. The either-endpoint helper was not needed.
- **`contain` vs `contain.text`**: this spec uses only bare
  `should("contain", x)` on **single-element** subjects
  (`query-visualization-root`, `sidebar-right`, `.cm-lineNumbers`), where the
  any-of/concatenation distinction collapses. `toContainText` is exact-faithful
  here.
- **DOMRect deep-eq / `should("be.empty")` / `not.have.value`**: none present.
- **Testids that exist nowhere in the product**: checked the non-obvious ones
  against `frontend/src` — `variable-type-select`, `native-query-top-bar`,
  `Parameter widget label`, `Default parameter widget value`,
  `Time grouping options`, `Get Answer` all exist. **No phantom testids in
  this spec.**

## Mutation testing — 29 mutants, 29 killed (1 bad mutation, replaced)

All mutations invert an **input** (typed text, fixture value, key pressed,
viewport, an interaction step) and leave every expectation untouched. Run in
three batches across independent tests, plus two targeted follow-ups; the spec
was restored byte-identical afterwards (`diff` clean, `tsc --noEmit` clean,
final run 28 passed / 2 skipped).

Every one of the **28 executable tests** has at least one killed mutant.
Where a mutant is marked **(tail)** it died at the test's LAST assertion, not
its first — deliberately aimed there, since batch A showed several tests dying
at assertion #1.

| # | Test | Mutation (input) | Died at |
| --- | --- | --- | --- |
| M1 | create and run a SQL question | `from orders` → `from products` | only assertion |
| C1 | suggest currently viewed collection | never pick a dashboard (Escape the picker) **and delete the intermediate assertion**, so only the tail can catch it | **(tail)** — read "Our analytics" |
| C2 | displays an error | `not_a_table` → `orders` | only assertion |
| M2 | error running selected text | 19 → 5 `Shift+ArrowLeft` | only assertion |
| B2 | should handle template tags | widget value `3` → `5` | only assertion |
| B3 | modify parameters when tags modified | default value `Gizmo` → `Widget` | **(tail)** `parameter.default` |
| B4 | recognize template tags as parameters | drop the 2nd `{{stars}}` tag | assertion #1 |
| B5 | create entries in variables sidebar | typed label ` updated` → ` revised` | only assertion |
| B6 | required prop for time grouping | default unit `Year` → `Quarter` | **(tail)** "January 1, 2025" |
| M5 | reset default value on option change | fixture `default: "year"` → `"month"` | assertion #2 |
| B7 | validation error when query invalid | `setVariableType` → `setVariableTypeAndField` (Save becomes enabled) | only assertion |
| B8 | can save a question with no rows | Escape instead of clicking Save | **(tail)** URL regex |
| M3 | add new columns after hiding (#15393) | `, 3 as added` → `, 3 as other` | **(tail)** `/added/i` |
| B9 | should not autorun ad-hoc native queries | `autorun:false` → run the query | only assertion |
| M4 | preview a fully parameterized query | widget `Gadget` → `Gizmo` | **(tail)** compiled SQL |
| B10 | show errors when previewing | fill the Category param first | only assertion |
| B11 | run query on meta+enter | extra `Enter` **after** the run | **(tail)** `.cm-lineNumbers` not-contain "2" |
| B12 | format via keyboard shortcut | `Mod+Shift+f` → `Mod+Shift+g` | only assertion |
| B13 | add tab at end of query | `Tab` → `Space` | only assertion |
| B14 | indent line when selected | drop the `Mod+A` | only assertion |
| B15 | indent next line on newline | drop the leading `Tab` | only assertion |
| M9 | mongo indentation | skip the "QA Mongo" DB selection | line-1 assertion |
| B16 | mongo two-space tab | `Tab` → `Space` | only assertion |
| M8 | two sidebars | drop the 2nd `visibility-toggler` click | `expectCypressHidden` |
| D1 | two sidebars | viewport `800×800` → `400×800` | **(tail)** `width > 350` |
| B17 | data reference: show tables | drop the header-title click | **(tail)** "Data Reference" |
| B18 | data reference: show models | `renamed_id` → `other_id` | **(tail)** RENAMED_ID click |
| M7 | metrics: should NOT show metrics | **create** ORDERS_SCALAR_METRIC in that test | the absence assertion (`toHaveCount(0)` got 1) |
| M6 | metrics: should show metrics | metric `description` "A metric" → "A widget" | assertion #3 |

### The one survivor, and why it was a BAD mutation (calling out my own)

**B1** made the *second* `startNewNativeQuestion` also pass
`collection_id: THIRD_COLLECTION_ID`, expecting the tail ("Orders in a
dashboard") to flip back to "Third collection". It **survived**.

That is not vacuity — it is the mutation being wrong. The test's whole claim is
that a recently-selected **dashboard beats** the current collection context, so
re-supplying the collection is precisely the case the app is supposed to
ignore. The mutant "surviving" is the assertion being *correct*.

Replaced with **C1**, which inverts the actual input (never select a dashboard)
and deletes the intermediate assertion so **only the tail can catch it**. C1
killed, with the tail reading `"Our analytics"`. The tail is load-bearing.

### Two anti-vacuity results worth naming

- **M7 is the important one.** Upstream's `findByText(/metric/).should("not.exist")`
  fires immediately after a click and would pass on an unrendered sidebar. With
  the `"9 columns"` anchor added, seeding a metric makes it go red
  (`toHaveCount` received 1). The absence check is real.
- **M8 proves `expectCypressHidden` is not the degenerate "element missing"
  case** — leaving the sidebar open makes it fail on the computed-style probe,
  so it is asserting hiddenness, not absence.

### Not triggered by any failure mode I could induce

- **"should recognize template tags and save them as parameters" — the reload
  assertion** (`GET /api/card/:id` → `parameters.length === 2`). Every input
  mutation that changes the persisted parameter count kills the earlier
  request-body assertion first, and I could not construct an input under which
  the POST body carries 2 parameters but the reloaded card does not. So this
  tail is **unproven, not proven-vacuous** — I could not induce a failure mode
  it would catch. It is faithful to upstream either way (upstream has the same
  structure).

### Control probe (not a mutant): is the whitespace comparison actually strict?

B13/B16 double as the control the header's `toHaveText` note needed: swapping
`Tab` for `Space` changes `"SELECT\t"` → `"SELECT "` and `"  "` → `" "`, and
both went red. Under `toHaveText`'s whitespace normalization those two pairs
compare **equal**, so those tests would have been green while asserting
nothing. `expectEditorTextContent` / `expectLineTextContent` are strict.
