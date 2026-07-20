# question-reproductions-1 (slot 1, port of `reproductions-1.cy.spec.js`)

Source: `e2e/test/scenarios/question-reproductions/reproductions-1.cy.spec.js` (834 lines)
Target: `tests/question-reproductions-1.spec.ts`
Support: `support/question-reproductions-1.ts` — **no name deviation**, matches the target.

Verified against the local CI uberjar. Backend confirmed by `ps` (`java -jar
target/uberjar/metabase.jar`) **and** `version.hash` = `751c2a9` vs
`target/uberjar/COMMIT-ID` = `751c2a98` — not taken on trust from `JAR_PATH`,
since the slot backend was already up and `PW_KEEP_SLOT_BACKENDS=1` silently
ignores it.

## Collision checks

1. **Same-basename siblings in the source dir**: yes — `reproductions.cy.spec.**ts**`
   sits alongside `reproductions-1/-2/-3/-4.cy.spec.**js**`. **I ported the `.js`
   `reproductions-1`.** There is no `reproductions-1.cy.spec.ts` twin.
2. **Existing target**: `tests/question-reproductions{,-2,-3,-4}.spec.ts` all
   exist and all landed today. I read all four headers and confirmed each maps to
   a distinct source (`question-reproductions.spec.ts` ports the `.ts`
   `reproductions.cy.spec.ts`, not this file). No pre-existing
   `question-reproductions-1.spec.ts`. No overwrite.
3. **Support module name**: `support/question-reproductions-1.ts`, matching the
   spec. Nothing dangling.

## Infra tier — @external (QA Postgres) for 3 of 10 describes, none for the rest

Determined by opening the spec, not by trusting tags. Here the tags are accurate
in both directions:

| describe | tag | actually needs |
| --- | --- | --- |
| 6239, 9027, 17514 (×2), 17910, 11914/18978/18977/23857, 19341, 19742, 19893 | none | nothing — H2 sample DB only |
| 14957 | `@external` | real: `restore("postgres-12")` + picks "QA Postgres12" in the data picker |
| postgres > custom columns (15714) | `@external` | real: `restore("postgres-12")` + opens a table from database 2 |
| 15876 | `@external` | real: native card on `database: 2` |

**The `WRITABLE_DB_ID` in the 15714 describe is a red herring — this spec never
touches the shared writable container, so #85 does not apply.** Upstream imports
`WRITABLE_DB_ID` from `cypress_data.js`, but it is just the literal `2`, and
under the **postgres-12** snapshot database 2 is the read-only **"QA Postgres12"**
sample. Verified two ways: `grep` of `e2e/snapshots/postgres_12.sql` shows
database "QA Postgres12" with `accounts/analytic_events/feedback/invoices/orders/
people/products/reviews` in schema `public`, and the test resolves `orders`
there at runtime. No `writable_db`, no debris schemas, no virtualized-picker or
`visitDataModel` hazard. I flagged this in the spec header because the constant
name invites the opposite conclusion.

`issue 19742` does drive the admin Table Metadata picker, but against the **Sample
Database** (single schema), so the auto-expand gate is fine.

No mongo, mysql, maildev, webhook-tester, snowplow, or EE token anywhere in this
spec. `mongo-sample`/`mysql-sample`/`maildev`/`webhook-tester` were up but
irrelevant. **"n/a" is the honest container answer for 7 of 10 describes.**

## Executed vs gate-skipped, with the control

- **Gate ON** (`PW_QA_DB_ENABLED=1`): **11 passed, 2 skipped** (the two `@skip`
  tests). All 3 `@external` tests genuinely executed.
- **Gate OFF control** (identical command, flag removed): **8 passed, 5 skipped**.
  Exactly the 3 `@external` tests moved to skipped; nothing failed, and no
  `afterEach` fired against a short-circuited `beforeEach` (the failure mode that
  turned one earlier port's control into "48 failed instead of 48 skipped").
- `--repeat-each=2`, gate on: **22 passed, 4 skipped**, twice.
- `bunx tsc --noEmit`: clean.

## Fixes needed (2 on run 1)

1. **Known gotcha, my miss — `QuestionDisplayToggle` disabled ancestors.**
   `cy.icon("table2")` in issue 6239 is the toggle's "Switch to data" segment;
   both radios are `disabled: true` by design and the `SegmentedControl` root
   handles the click. Playwright reads `disabled` off ancestors, so it burned the
   action timeout on "element is not enabled". Fixed with `click({ force: true })`,
   scoped and commented. This is PORTING's canonical case and the sibling
   `question-reproductions.spec.ts` header already documents it — the brief was
   right, I should have caught it while writing.

2. **NEW gotcha — the shared `openTable` DROPS its `database` option on the
   notebook branch.** `ad-hoc-question.openTable({ database, table, mode:
   "notebook" })` delegates to `joins.openTableNotebook`, which **hardcodes
   `SAMPLE_DB_ID`** (`support/joins.ts:44`). Issue 15714 opens a QA-Postgres
   table, so the notebook loaded database 1 with a database-2 table id, the data
   step rendered empty, and the helper's own readiness gate timed out.

   **The fingerprint points nowhere near the cause**: `getByTestId('step-data-0-0')
   .getByTestId('data-step-cell')` not found, thrown from inside a *shared,
   correct-looking* helper — it reads as "the table picker is broken" or "the
   table id lookup failed", not "the database argument was silently discarded".

   Worked around locally with `openTableNotebookInDatabase` in my support module
   (shared modules are off-limits to porting agents). **Blast radius: harmless
   today** — the option is only *silently* dropped, and I checked that every
   other current caller of the notebook branch opens a sample-DB table. But it is
   a latent trap for any future QA-DB port. Consolidation candidate: give
   `openTableNotebook` a `database` parameter defaulting to `SAMPLE_DB_ID`.

## Mutation testing — 7 mutants, 6 killed, 1 bad mutation of mine

Input inverted in every case, never the expectation. Death location recorded.

| # | mutation | result |
| --- | --- | --- |
| M1 | 6239: remove the descending-sort toggle | **killed, but EARLY** — at `visualize()`'s dataset wait (unchanged notebook → no query fires). Tail left unproven → M1c. |
| M1c | 6239: change aggregation to `CountIf([Total] > 50)` **and delete the head assertions** so the mutant can reach the tail | **killed at the TAIL** — `toHaveText("584")`. Tail is load-bearing. |
| M2 | 9027: make `archiveQuestion` a no-op | **killed on target** — the not-exists branch, `toHaveCount(0)` resolved to 1. Also proves my added entity-picker anchor didn't make the absence check vacuous. |
| M3 | 19742: remove the "Hide table" click | **killed on target** — the "Orders" absence check. Passed my added `Products` anchor first, then failed on the assertion under test, which is exactly the intended sequencing. |
| M4 | 15876: corrupt ONE timestamp in the native fixture (`16:29` → `18:29`) | **killed** — `toHaveCount(6)` received 3. Strongest form: corrupts data no assertion names directly. |
| M5 | 11914 etc.: run the three drill probes as **admin** with the earlier permission assertions stripped | **killed at the first `assertNoOpenPopover`** — received 1. **This is the important one**: it proves the absence checks are NOT vacuous — `POPOVER_ELEMENT` really does match a drill popover, and the 1000ms settle is long enough to see it. |
| M8 | 19341: flip `enable-nested-queries` to `true` | **killed** — the entity-picker `getByRole("tab")).toHaveCount(0)` assertion. |

### One assertion I could not make fail — stated plainly

`issue 19341`'s `expect(modelTypes).not.to.include("card")` (the `data-model-type`
set over `result-item`s) **survived both M8 and a follow-up M8b** that enabled
nested queries *and* renamed the saved question to `"Ordinary native"` so it would
match the `"Ord"` search. Both runs died later, at the tab assertion.

Reason, as far as I can tell: by that point the picker has been drilled into
**Sample Database**, so its search is scoped to tables in that database and a
saved question cannot appear regardless of the setting. Plausibly the assertion
was meaningful when the picker's search was global and the scope changed
underneath it.

I am recording this as **"not triggered by any failure mode I could induce"**,
not as "structurally vacuous" — the assertion does read real DOM (my added anchor
guarantees the result set is non-empty), and its positive half
(`modelTypes.to.include("table")`) is genuinely grounded. Same semantics upstream,
so this is not port drift.

### A bad mutation of mine, called out

**M6** (17910: stop typing the description but keep the click+blur) **survived**,
and I initially read that as a vacuous revision assertion. It is not — the
mutation was bad.

Probing presence under the same mutation (per PORTING) printed the revision list
as `["You added a description.", "You created this."]`. Focusing and blurring the
EditableText writes `description: ""`, and `null → ""` is itself a revision. So my
mutation removed the *text* but not the *edit*.

**M6b** — removing the description interaction entirely — **killed it**
(`Expected: 2, Received: 1`, only "You created this."). The assertion is
load-bearing for the test's actual subject (the revision list updating live
without a reload).

Worth knowing anyway: the assertion counts revisions, not content, so the typed
string `"A description"` is not load-bearing. Identical upstream — not a port
issue, just a limit on what that test proves.

### Incidental confirmation of a known gotcha

The M6 probe called `.count()` and then `allTextContents()` on the same locator a
moment later: **`count()` returned 0 while `allTextContents()` returned 2 entries**
— a clean live demonstration of "locator.count() does not retry" (PORTING,
batch 12). My shipped assertion uses the retrying `toHaveCount(2)`, so it is
unaffected; noting it because it is a tidy measurement of an existing rule.

## Anchors added (absence checks that would otherwise sample too early)

All flagged inline with `ANCHOR (added)` and chosen to be present in **both**
branches so they cannot prejudge the assertion:

- `goToSavedQuestionPickerAndAssertQuestion` (9027) — anchor on the sample
  instance's own "Orders" question at picker level 1 before asserting "Foo"
  absent/present. M2 confirms the absence check still bites.
- 15714 — anchor on the formatted formula being in the editor before asserting
  the "expects 1 argument" error is absent.
- 19341 — require at least one `result-item` to be visible before reading the
  `data-model-type` set (a `count()` over an unrendered list is trivially "no
  cards"); plus an explicit modal-visible + loading-indicator gate before the
  `getByRole("tab")` absence check.
- 19742 — anchor on "Products" (upstream's own next assertion) **before** the
  "Orders" absence check rather than after. M3 confirms.
- 11914 etc. — port `H.popover()`'s implicit visibility assertion before each
  `Duplicate` absence check.
- `assertNoOpenPopover` — no positive DOM signal exists for "the click was
  ignored", so it uses a documented 1000ms bounded settle, well clear of the
  ~243ms drill-popover paint PORTING measured. M5 proves this is enforcing.

## Other porting notes

- **`H.CustomExpressionEditor.focus()`'s `force` is load-bearing** and the shared
  `custom-column-3.focusCustomExpressionEditor` uses a *real* click, which
  PORTING records as having cost another spec five 30s timeouts. I did not use
  it — my support module has a `dispatchEvent`-based
  `focusCustomExpressionEditorForced`. Three specs still call the shared
  real-click version; still worth someone walking them.
- Every `click({ force: true })` in the source is ported as
  `dispatchEvent("click")` (the palette icon, the eye_outline column toggle,
  "Remove step", the row ellipsis, the relative-date "Previous" option), since
  Cypress's `force` dispatches rather than moving a real mouse.
- The row-ellipsis lookup builds its `has:` sub-locator from `page`, never from
  the row Locator.
- 17910's description field is handled as a placeholder trap: the locator is
  resolved **once** and reused for click / type / blur.
- `assertNoOpenPopover` deliberately uses the **bare** `POPOVER_ELEMENT`
  selector, not the shared `popover()` helper — upstream's `cy.get(H.POPOVER_ELEMENT)`
  has no `:visible` filter, unlike `H.popover()`.
- `aria-disabled` is not one of jQuery's boolean attributes, so
  `should("have.attr", "aria-disabled", "true")` really does compare the value —
  ported as the two-argument `toHaveAttribute`, unlike the `disabled` case.
- `issue 19893`'s two tests are `@skip` upstream; ported in full and skipped with
  that reason rather than dropped.

## Fixmes

**None.** No `test.fixme`, no weakened assertion, no dropped or merged test. 13
upstream tests → 13 tests.

⚠️ **Count corrected by the coordinator, 2026-07-20.** This file originally said
"12 upstream tests → 12 tests" while also reporting "11 execute + 2 skip", which
sums to 13 — the prose was internally inconsistent. Verified by counting
`^\s*test\(` in the port (13) against `^\s*it\(` in the source (13): a true 1:1
mapping. The undercount omitted one of the two `17514` scenarios and counted
only top-level describes. **No coverage was ever missing** — this was a
documentation error, not a gap.

## CI-drift risk to watch

Issue 6239 pins data-derived values (`"1"` and `"584"`, the min/max monthly
`CountIf([Total] > 0)` over the sample DB) and 15876 pins exact row counts. These
are upstream's own assertions so I ported them verbatim, but they are precisely
the class PORTING warns differs between the stale local jar (COMMIT-ID
`751c2a98`, sample data dated 2026-07-17) and CI's freshly built merge jar. If
either goes red in CI with an off-by-a-little number, suspect sample-data drift
before suspecting the port.

## Three-line summary

Ported all 13 tests of `reproductions-1.cy.spec.js` with no fixmes, no
weakenings and no merges; 11 execute green (22/22 under `--repeat-each=2`) and 2
are the upstream `@skip` pair. Infra tier is `@external`/QA-Postgres for 3 of 13
describes and genuinely nothing for the other 7 — the `WRITABLE_DB_ID` reference
is a red herring, so this spec never touches the contaminated writable container.
Two run-1 fixes: the known `QuestionDisplayToggle` disabled-ancestor case (my
miss), and a new one worth propagating — the shared `openTable` silently discards
its `database` argument in notebook mode, failing with a fingerprint that points
at the picker rather than the dropped argument.
