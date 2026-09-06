# whitelabel.spec.ts (admin-2/whitelabel.cy.spec.js)

Ported 21 tests (42/42 under `--repeat-each=2`) on the jar, slot 2. No product
bugs, no fixmes — every fix was port-fidelity. No Cypress cross-check needed
(nothing claimed against the app).

## Fixes classified

- **Known gotcha (transient-UI toast → `.first()`).** "Changes saved" undo
  toasts stack (the illustration settings fire *two* PUTs → two toasts), so
  `getByText("Changes saved")` was a strict-mode violation. Defaulted all toast
  text assertions to `.first()` per the existing PORTING rule. The login-page
  test also *closes* toasts (`icon(undoToast, "close")`); those auto-dismiss
  with an animation, so the close-click races their removal — made it
  best-effort (`try/catch`, re-resolve `.first()` each iteration, never
  snapshot with `.all()` — the snapshot goes stale after the first removal).

- **New gotcha: the `/api/setting/:key` GET returns raw text/plain, not JSON.**
  `checkFavicon`'s `response.json()` threw `SyntaxError: Unexpected token 'h'`
  on `"https://cd…"`. String settings come back as the bare value; use
  `response.text()`, not `.json()`. (Worth a one-liner in the playbook — any
  port that reads a single setting via the API will hit this.)

- **New gotcha: a loading-message / spinner state is sub-100ms on the jar.**
  The custom loading message renders only in the QB overlay *while the query
  runs* (`QueryVisualization` `<Title>`), and against the jar's static assets
  that window is shorter than Playwright's poll interval, so `toBeVisible`
  missed it every time (Cypress's retry-until-timeout caught the flicker).
  Held the query response back ~1.5s with `page.route(…/api/card/\d+/query…)`
  → `route.continue()` so the state the test targets is observable. General
  pattern for any "assert the transient loading/spinner text" port.

- **New gotcha: entity-picker search `pressSequentially` races the freshly
  mounted modal.** On a contended repeat run the first keystrokes dropped, the
  search stayed empty, and the "No results" illustration never rendered
  (`element(s) not found`, not a wrong value). Gate on the value landing —
  `await expect(searchInput).toHaveValue(query)` after typing — before
  asserting the illustration. (Same class as the CodeMirror "assert focus
  before typing" rule, applied to a Mantine search input in a just-opened
  modal.)

## Notes

- New helpers live in `support/whitelabel.ts` only (checkFavicon, checkLogo,
  changeLoadingMessage, setApplicationFontTo, helpLink,
  getHelpLinkCustomDestinationInput, LOGO/FAVICON data-URI + path constants).
  Everything else imported read-only (goToMainApp from filters-repros,
  getProfileLink/getHelpSubmenu from command-palette, undoToast from metrics,
  entityPickerModal from notebook, selectDropdown from dashboard, deleteToken
  from admin-extras, createDashboardWithQuestions from factories, ui.ts,
  sample-data).
- `@prerelease` (login-page illustration) has no Playwright equivalent — runs
  unconditionally, as in the other ports.
- Not infra-gated: the favicon test's external URL is only stored + asserted in
  the `<head>` link (no fetch), and `/unsubscribe` is a static page. No SMTP /
  webhook / external DB touched.
- The "starter" and "pro-self-hosted" tokens both resolve from
  `cypress.env.json`; the describe is skip-gated on `pro-self-hosted`.
