# models.spec.ts (port of models/models.cy.spec.js)

Ported all 21 tests (675-line source, no gating tags). Verified on the CI EE
jar (slot 4, `PW_PER_WORKER_BACKEND=1`), 21/21 green, then 42/42 under
`--repeat-each=2`. tsc clean. New helpers isolated in `support/models-core.ts`
(imports from models.ts / native-editor.ts / ui.ts; no shared files edited).

No product bugs and no `test.fixme` — every fix was mechanical / a known
gotcha, so no Cypress cross-check was required (fidelity is not in doubt when
nothing was flagged).

## Fixes, classified

- **Known gotcha (rule 3 — any-of-set visibility).** `assertQuestionIsBasedOnModel`
  ports `cy.findAllByText(collection)` / `findByText(model)`, which assert
  *existence*, not visibility. The QB renders hidden duplicate labels ("Our
  analytics" 23×, first one hidden — a collapsed breadcrumb), so `.first()`
  landed on a hidden node. Fixed with `.filter({ visible: true }).first()`.
  Bit 4 tests before the fix.

- **Known gotcha (pinned-icons-appear-twice), extended.** A collection-table
  row's type icon `.Icon-table2` matches **twice** — the row's type icon *and*
  a hover/selection check-overlay icon. Here the DOM-first match was the
  **hidden** overlay, so a plain `.first()` still failed on visibility (the
  documented gotcha only needed `.first()`). Needed
  `.filter({ visible: true }).first()`. The model card icon (`getCollectionItemCard`)
  matched only once and was fine with a plain `.first()`.

- **Faithful-port divergence worth flagging: `startNewQuestion`.** The current
  Cypress `H.startNewQuestion` (e2e-ad-hoc-question-helpers.js) navigates to
  `/question/notebook#<hash>`, but the shared `notebook.ts startNewQuestion`
  clicks the app-bar "New" → "Question". Two data-picker tests here **never
  visit first**, so the app-bar form has no app to click, and the
  `enable-nested-queries` test needs `mockSessionProperty` registered *before*
  the navigation (a client-side New click wouldn't re-fetch session props).
  Ported a URL-navigation `startNewQuestion` in models-core.ts (reuses
  `adhocQuestionHash`, mirrors `newCardHash` exactly: no `display` key → the
  hash keeps `display:"table"`, `displayIsLocked:false`).
  **Consolidation note:** `notebook.ts startNewQuestion` has drifted from the
  current upstream helper — worth reconciling the two in a later pass.

## Faithful-port notes (mechanical)

- `@dataset` / `@cardUpdate` / `@cardQuery` intercepts → `waitForResponse`
  registered before the trigger (`waitForDataset` from models.ts,
  `waitForCardUpdate`/`waitForSearch` new in models-core). `waitForCardUpdate`
  takes an optional id so the "turn back to saved question" / undo / edit-info
  tests pin to `PUT /api/card/:ORDERS_QUESTION_ID`.
- `H.createNativeQuestion` ported in models-core as the two-step factory (POST
  without `type`, then PUT `type` for model/metric) — matches the Cypress
  `question()` helper. Caller drives the visit (visitQuestion/visitModel /
  a plain goto) so the query waits stay in the test body.
- Never-awaited intercepts dropped (rule 2): the `@schema` intercept in "allows
  to create a question based on a model" is registered but never waited upstream.
- EditableText title/description in "can edit model info": click + select-all +
  `keyboard.type` / `pressSequentially` + blur, anchored on the PUT
  (fill() wouldn't mark them dirty — wave-5 gotcha). `findByDisplayValue("M1")`
  → `toHaveValue` on the header title textarea.
- The "redirects to /model URL" test keeps the upstream warning (do NOT use
  `visitQuestion`): the /question URL 302s to /model and runs `/api/dataset`,
  so the card-query endpoint never fires — used a bare goto + `waitForDataset`.
- `cy.url().should("not.include"/"match")` / `cy.location("pathname").should("eq")`
  → `expect(page).toHaveURL(predicate|regex)`, which retries across the
  post-save navigation.
- The native card-tag edit ("…variables into models") ports
  `NativeEditor.focus().type("{leftarrow}{leftarrow}{backspace}{backspace}#1-orders")`
  as `focusNativeEditor` (click + End) + real arrow/backspace/type keys; save
  via the qb-header Save button (no `{force}` needed — Playwright cleared the
  autocomplete on its own).
