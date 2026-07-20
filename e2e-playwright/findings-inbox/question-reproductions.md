# question-reproductions

Port of `e2e/test/scenarios/question-reproductions/reproductions.cy.spec.ts`
(1017 lines) → `tests/question-reproductions.spec.ts` +
`support/question-reproductions.ts`.

**24 tests across 19 describes. 24/24 green on the jar; 48/48 under
`--repeat-each=2`. `bunx tsc --noEmit` clean.**

---

## Collision checks (both done before writing)

- **Source dir**: `reproductions-1/-2/-3/-4.cy.spec.js` exist, but there is
  **no `reproductions.cy.spec.js`** — my `.ts` source has **no `.js` twin**. The
  visualizations-charts hazard does not apply here.
- **`tests/`**: `question-reproductions-2/-3/-4.spec.ts` exist;
  `question-reproductions.spec.ts` did **not**. No overwrite risk.

## Infra tier — MIXED (the classifier's "@external ⇒ needs a QA database" is right here, but incomplete)

Four of nineteen describes need a container; **fifteen run entirely on the H2
sample database**.

| describe | snapshot | container | upstream tag |
|---|---|---|---|
| `issue 47793` | `mongo-5` | mongo-sample | `@external @mongo` |
| `54205` | `postgres-writable` | postgres-sample (`writable_db` :5404) | **untagged** |
| `issue 13347` | `postgres-12` | postgres-sample | **untagged** |
| `issue #47005` | `postgres-12` | postgres-sample | **untagged**, and **never uses it** |

Two things worth flagging:

- **Three of the four container describes are untagged upstream.** The gates in
  this port are a deliberate judgement, not transcription. This is the same
  shape as the untagged-but-token-calling describe caught on a sibling.
- **`issue #47005` restores `postgres-12` and then touches only the sample
  database.** Clearest "audit the snapshot dependency" candidate in the file
  (the `custom-viz` precedent in PORTING.md) — swapping it to `"default"` would
  free its test onto the bare jar. Not done: faithfulness, and the change is a
  separate decision from this port.

### Gate-OFF control (#67/#49), run with `PW_QA_DB_ENABLED` unset

**19 passed, 5 skipped, 0 failed.** The 5 skips are exactly the container
tests (47793, 54205, 13347 ×2, 47005). No untagged-but-container-calling
describe leaked through, and no `afterEach` fired on a skipped `beforeEach`.

### Container evidence (#85)

Only `54205` touches the writable container, and only its own
`public.products`. Inspected before and after via `psql`:

- Before: 29 non-system schemas — `Domestic`/`Wild`/`Schema A`…`Schema Z` each
  holding `Animals` (+ `Wild.Birds`), and `public` with `composite_pk_table`,
  `many_data_types`, `no_pk_table`, `products`.
- After: **identical** (29 schemas, `public` still 4 tables). No foreign schema
  dropped; no debris added.
- **No foreign `products` existed**, but the lookup is schema-pinned
  (`schema: "public"`) anyway, per the rule.

---

## Fixes needed (3 on run 1, all port drift — classified per the feedback loop)

1. **`46845` — `openQuestionActionsItem` couldn't find "Edit metadata".**
   *New gotcha, generalises.* On the **model** page the question-actions menu
   renders as a bare `role="menu"` that the shared `popover()` selector does
   **not** match, and the row's accessible name is
   `"label icon Edit metadata 33%"` — the **icon's aria-label is part of the
   name**, so an `^Edit metadata`-anchored regex matches nothing. (Same family
   as the "avatar initial is part of the accessible name" rule, and it defeats
   the *documented* workaround for the completeness badge.) Fixed with a
   page-wide `getByRole("menuitem", { name: /Edit metadata/ })`.

2. **`54205` — `Field with name name cannot be found on table 199`.**
   *New gotcha; a sharper instance of the known `resyncDatabase` hole.*
   The `postgres-writable` snapshot's **app DB already carries a `products`
   table row for database 2 with `initial_sync_status: "complete"`** (measured:
   table 199, from the sample data that lived in `writable_db` when the snapshot
   was generated — the snapshot lists accounts/analytic_events/feedback/
   invoices/orders/people/products/reviews, none of which exist in the container
   any more). So `resyncDatabase({ tables: ["products"] })` — and the Cypress
   `waitForSyncToFinish` it faithfully ports, which gates on **exactly the same
   condition** — is satisfied *instantly by the stale row*, before the sync has
   re-read the table we just dropped and recreated. PORTING already flags the
   bare `{ dbId }` form as "gates on nothing"; **passing `tables` does not close
   the hole when a stale *complete* row exists.** Cypress's command-queue pacing
   hides it upstream. Fixed by polling the table+field lookup
   (`getSyncedFieldId`).

3. **`#67903` — `should("not.be.visible")` on a laid-out, unclipped element.**
   *New gotcha, and the most reusable one here.* See below.

Plus one hygiene fix: `57398`'s 5 s route delay is still in flight at test end,
and Playwright attached the resulting `route.fetch: Test ended` error to the
**next test's** error-context (observed on run 1 — it reads as that test having
two unrelated failures). `page.unrouteAll({ behavior: "ignoreErrors" })` at the
end of the test.

---

## FINDING 1 — Cypress's `not.be.visible` is an OCCLUSION test for `fixed`/`sticky` elements

`cypress/packages/driver/src/dom/visibility.ts` branches: if the element **or
any ancestor** is `position: fixed` **or `sticky`**, Cypress skips the
ancestor-overflow bounds check and instead runs `elIsNotElementFromPoint` —
the element is hidden when `document.elementFromPoint` at its centre is not
itself or a descendant.

That branch **is** issue #67903 ("should not show preview table headers **on
top of** other elements"). Measured on this jar: `table-header` is
`position: sticky`, sits at a perfectly ordinary rect
(`x=17 y=318 w=882 h=37`) inside a visible `overflow: auto` scroll container,
`visibility: visible`, `opacity: 1` — and `elementFromPoint` at its centre
**and at all four corners** returns `DIV.cm-line`, the SQL sidebar's CodeMirror.

Consequences:
- A `not.toBeVisible()` / `toBeHidden()` port of this assertion **fails on a
  correct app**, and an overflow-clipping-only port (the PORTING
  `toBeInViewport` guidance) fails too. Neither models occlusion.
- The existing `expectCypressHidden` in `support/question-reproductions-4.ts`
  covers display/visibility/opacity/zero-size but **not** this branch. Mine
  (`support/question-reproductions.ts`) implements the full rule set and is the
  consolidation candidate of the two.
- Generalise: **any port of `should("not.be.visible")` whose subject is sticky
  or fixed is an occlusion assertion, not a layout one.**

## FINDING 2 — `expect(rect).to.deep.eq(otherRect)` on two DOMRects is ALWAYS TRUE

Issue 39487's `assertPreviousButtonRectDidNotChange` and
`assertNextButtonRectDidNotChange` do
`expect(rect).to.deep.eq(previousButtonRect)` where both sides are
`getBoundingClientRect()` results. `DOMRect` exposes
x/y/width/height/top/right/bottom/left as **accessors on the prototype**, so
`Object.keys(rect)` is `[]`, and DOMRect is not iterable — deep-eql's
`objectEqual` returns `true` when both operands have no enumerable keys and no
iterator entries.

Verified empirically against the repo's own `deep-eql@5.0.2` with a
prototype-getter stand-in tagged `[object DOMRect]`: two objects whose getters
return `1` and `999` compare **deep-equal**. (Caveat stated: Cypress bundles
chai 4's deep-eql 4.x, not 5.0.2; the `objectEqual` empty-keys path is the same
in both, but I did not run 4.x directly.)

So **two of the three assertions in that helper cannot fail upstream** — only
`expect(height).to.eq(initialPickerHeight)` is load-bearing, and the test's name
("calendar has *constant size*") is only half-covered.

**I strengthened them** to a real field-by-field comparison rather than porting
a no-op, and said so in the code. This is disclosed, not silent. Mutation M1
(below) confirms the strengthened form is load-bearing — and that a 3px shift,
which upstream would sail past, now goes red.

## FINDING 3 — `issue 13347`'s second test is vacuous (upstream too)

`entityPickerModalLevel(2)` under "Sample Database" is a **table** list. The two
absence assertions look for saved questions there — and those questions live on
**database 2** (the QA Postgres), not the sample database.

Proved by the "assert presence under the same mutation" method rather than by
reading: under mutation M6 (`create-queries: "no"` → `"query-builder"`, the
exact inversion that **kills** the sibling mini-picker test), level 2 contains
exactly `["Orders", "People", "Products", "Reviews"]` and
`entity-picker-modal` matches `/13347/` **zero** times anywhere in the modal.
The locator can never match; no permission change can make it.

Vacuous in Cypress too — same DOM, same semantics — so this is an upstream
issue, not port drift. Ported **verbatim with the analysis inline**, plus the
implicit-existence anchor Cypress's `.within()` carries (level visible +
"Orders" attached), which is the only honest part of that test.

## FINDING 4 — `issue 14124`'s setup step is inert on current code

Deleting the `PUT /api/field/:id { semantic_type: null }` leaves the test
**green**. The mutation really applied — `ORDERS.CREATED_AT` is
`type/CreationTimestamp` by default, confirmed via the metadata API. So the
precondition this 2020-era issue was written around no longer influences the
rendering.

Not vacuity of the *assertions*, which I then proved separately (M2b/M2c
below). Recorded inline; left verbatim.

---

## Mutation testing

11 mutants, deliberately spread and biased at **tail** assertions. **All 11
killed** (2 needed a follow-up to resolve a survivor — neither was vacuity of
the kind first suspected).

| # | Mutation (input, never the expectation) | Test | Died at |
|---|---|---|---|
| M1 | 3px `margin-left` on the prev button, injected **after** the baseline is captured | 39487 ×2 | the **rect** assertions, i.e. *after* the height check — the tail I aimed at |
| M2 | remove the `semantic_type: null` PUT | 14124 | **SURVIVED** → Finding 4 |
| M2b | breakout `hour-of-day` → `hour` | 14124 | assertion #1 (column header) |
| M2c | add `limit: 2` (header intact, row gone) | 14124 | assertion #2 ("3:00 AM") — **tail proven** |
| M3 | mongo template-tag default `"10"` → `"20"` | 47793 | `toContainText("quantity: 10")` — tail (`$project` still passed) |
| M4 | first filter `Widget` → `Gadget` | 57398 | assertion #2 (filter pill), *after* the loading-indicator one |
| M5 | type `CA` instead of `NY` | 64293 | `ensureParameterColumnValue` — tail |
| M6 | `create-queries: "no"` → `"query-builder"` | 13347 ×2 | mini-picker test: the absence checks (tail). Big-picker test: **SURVIVED** → Finding 3 |
| M7 | last case sends a real `date_style` instead of unsetting | 68574 | the 4th/last `assertParameterFormat` — tail |
| M9 | drop the "View SQL" click | #67903 | the occlusion assertion |
| M10 | save under the name the absence check looks for | 55631 | the one-shot `countDisplayValue` — **proves that absence check is not vacuous** |

Notes on method:
- M1 is the one that matters for Finding 2: it is precisely the mutation the
  **upstream** form cannot detect.
- M10 was chosen because upstream's `{ timeout: 10 }` absence check is exactly
  the shape PORTING warns about. It is real, and the one-shot form is
  load-bearing (a retrying `toHaveCount(0)` would be satisfied by the modal
  closing — the opposite of what the test guards). Kept one-shot, justified in
  a comment.
- Both survivors were pursued to an answer rather than written off, per
  "vacuous, or bad mutation?".

## fixmes

**None.** No `test.fixme`, no skip beyond the four container gates. No
cross-check was run (parallel slots live — standing rule), and no product-bug
claim is made anywhere in this port.

## Environment

- Jar verified, not assumed: `target/uberjar/COMMIT-ID` = `751c2a98`,
  `/api/session/properties` → `version.hash` = `751c2a9`, `ps` shows
  `metabase.jar`. Slot 4103 only; port 4000 never touched.
- Run with `TZ=US/Pacific` (68574 and 14124 assert formatted dates/times).
- **CI-drift caveat**: the local jar is the Jul-18 merge. `issue 68574`'s four
  date-format assertions and `14124`'s "3:00 AM" are the data/format-derived
  class that can differ against a fresher CI merge jar; none of them pin a
  *derived magic number* (row counts, clamps), so the exposure is low.

## Consolidation candidates surfaced

- **`expectCypressHidden` ×2** — `question-reproductions-4.ts` (display/
  visibility/opacity/size) vs mine (adds the fixed/sticky occlusion branch and
  the overflow-clipping branch). Mine is the superset; fold `-4`'s into it.
- **`waitForUpdateCard` / `waitForDataset` / `waitForCardQuery`** are now
  byte-identical in `question-reproductions-2/-3/-4` **and** this module — four
  copies of the same three response waits. Clean unify target.
- **`getTableId`** exists in 3 modules (`schema-viewer`, `datamodel-data-studio`,
  `interactive-embedding`) and only `schema-viewer`'s takes a `schema` option —
  which #85 says every caller should be passing.
