# native-sql-generation

Source: `e2e/test/scenarios/metabot/native-sql-generation.cy.spec.ts` → `tests/native-sql-generation.spec.ts`
New helper: `support/native-sql-generation.ts`

## Result

5 tests ported faithfully. On the jar (slot 3, default): **3 pass, 2 skipped**
(6/6 pass + 4 skipped under `--repeat-each=2`; tsc clean). The 2 skipped are the
`multi-db` describe — it restores the `postgres-12` snapshot and drives QA
Postgres12, which isn't in the jar's snapshots nor provisioned in the spike, so
it's gated on `PW_QA_DB_ENABLED` (faithful-by-construction, runtime-unverified,
same class as custom-column-3 / actions-on-dashboards).

No `test.fixme`, no product-bug claims — so no Cypress cross-check required.
The LLM is fully stubbed (canned SSE `code_edit` data part), no key, jar-verifiable.

## Fixes classified

1. **Mantine Modal.Root reads "hidden" to Playwright while Cypress `be.visible`
   passes** (KNOWN-GOTCHA-adjacent / candidate for PORTING.md). The
   `data-testid` on `<Modal>` lands on Mantine's Modal.Root wrapper. When the
   modal is open, Cypress `cy.findByTestId(...).should("be.visible")` passes, but
   Playwright's `toBeVisible()` on that same Root wrapper returns `hidden` (the
   painted element is the inner `role="dialog"` content, not the Root). The
   modal WAS open (Mantine only renders Root when `opened`), so this is a
   selector-altitude fix, not a bug: assert the inner
   `getByRole("dialog", { name })` instead of the testid Root. Faithful outcome,
   correct element. Fingerprint is misleading — "24× resolved to <div
   ...Modal-root>, unexpected value hidden" reads like the modal never opened.

## Notes / non-issues

- `cy.intercept(POST agent-streaming).as("agentReq")` in the beforeEach is dead
  code upstream — the spec waits on `@metabotAgent` (created by
  `H.mockMetabotResponse`), never `@agentReq`. Dropped; ported as
  `page.waitForResponse` predicates registered before the generate click.
- The open shortcut (`Mod-Shift-i`) is a **CodeMirror keymap** extension
  (useInlineSQLPrompt.tsx), so it only fires when the editor has focus — hence
  the toggle helper focuses the native editor first (matches upstream). The
  close binding is a window-level tinykeys handler.
- The generating-loader and cancel tests need an in-flight window, so they use a
  local `mockMetabotResponseWithDelay` (delay 100 / 1000). The shared
  `support/metabot.ts mockMetabotResponse` fulfils immediately and can't be
  edited (rule 9); the delayed variant fulfils inside a try/catch because the
  Cancel path aborts the fetch before we fulfil (`route.fulfill` then throws —
  expected). The cancel assertion `@metabotAgent state == "Errored"` ports to
  `page.waitForEvent("requestfailed")`.
- SSE body builders (`mockCodeEditResponse` / `mockTextOnlyResponse`) reuse the
  shared `createMetabotSSEBody` / `metabotDataPart` / `metabotTextPart`.

## Possible consolidation candidate (later pass)

`mockMetabotResponseWithDelay` is a strict superset of the shared
`mockMetabotResponse` (adds `delay`). If another metabot port needs delayed SSE,
fold a `delay?` option into the shared helper rather than re-implementing.
