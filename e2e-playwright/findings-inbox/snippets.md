# snippets.cy.spec.js → tests/snippets.spec.ts

Native SQL snippets: create/edit/insert `{{snippet:…}}`, sidebar search,
preview a query with a snippet, snippet folders + permissions (EE), and the
read-only (git-synced) mode. New helpers in `support/snippets.ts` only.

Result: 16/17 tests green on the jar (slot 4), stable under `--repeat-each=2`
(32 passed, 2 skipped), tsc clean. The 1 skip is the whole `@OSS` describe
(gated on `isOssBackend`, correctly skipped on the EE jar).

## Fixes classified

- **Known gotcha (rule 4, hover-revealed control).** The snippet sidebar row's
  edit affordance sits behind a `CS.hoverChild` (`display:none` until the outer
  `.hoverParent:hover`). Cypress force-clicked the chevron; a Playwright
  force-click can't target a `display:none` element (no layout box). The real
  mechanism is that the chevron has **no onClick** — SnippetRow's OUTER div
  carries the `isOpen` toggle, and both Cypress's chevron force-click and its
  `.parent().parent().click()` just bubble to it. `openSnippetRow` dispatches
  the click straight at that outer div (build-agnostic, no hover race). Clicking
  the name instead fires `insertSnippet`, so the target must be the div, not the
  Flex. This is the faithful equivalent of the two Cypress idioms.

- **Known gotcha (rule 1, exact findByText).** All `cy.findByText(str)` →
  `{ exact: true }`; `cy.contains(/christ/i)` (15387) stayed a case-insensitive
  regex.

- **Known gotcha (rule 2, register-before-trigger).** `cy.intercept().as()` +
  `cy.wait()` for the `snippetCreated` POST, the `updateList`
  (`/api/collection/root/items?namespace=snippets`), the `updatePermissions`
  PUT (`/api/collection/graph?skip-graph=true`), and the `collections` GET →
  `page.waitForResponse` registered before the action.

- **Known gotcha (rule 5, CodeMirror).** Editing the snippet tag in place
  (15387) uses `focusNativeEditor` (which presses End = the `{end}`) then
  ArrowLeft/Backspace loops + `keyboard.type` — no realPress machinery.

- **Char-by-char typing hack dropped.** The Cypress
  `_clearAndIterativelyTypeUsingLabel` (type one char at a time to dodge
  autocomplete focus loss) is unnecessary — the snippet form's name/content are
  plain Mantine inputs, so `fill()` drives them in one shot (same as
  native-snippet-tags).

## Dividends

- **None retracted, none claimed.** No test.fixme, no product-bug claims — the
  whole spec ports faithfully and passes on the jar.

- **Flagged: read-only / git-sync is NOT infra-gated on the jar.** The
  `read-only snippets` describe drives the EE remote-sync feature. It needs only
  a **local `file://` git repo** (created in-process via `node:child_process` in
  `setupGitSync`) plus the pro-self-hosted token — no external server. The
  remote-sync endpoints are `:feature :none` (EE-code-gated, not token-feature
  gated), so they work on the EE jar. Both read-only tests pass. First git-sync
  port in the suite; the helpers (`setupGitSync` / `teardownGitSync` /
  `configureGitAndPullChangesReadOnly`) are reusable if remote-sync.cy.spec.ts
  is ever ported.

## Consolidation candidates

- `codeMirrorValue(scope)` (port of H.codeMirrorValue, `.cm-line` join) is
  generic — belongs in native-editor.ts on a consolidation pass.
- `createSnippet` is duplicated: `native-extras.ts` (used here) and the shape in
  `native-snippet-tags`. Already shared; no action.
- `getPermissionsForUserGroup` (findByText→ancestor `tr`→`permissions-select`)
  is a generic collection-permissions helper — could live with the permissions
  modal helpers.
