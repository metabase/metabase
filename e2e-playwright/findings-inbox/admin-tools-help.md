# admin-tools-help (admin/tools/help.cy.spec.ts)

7 tests, all green on the jar (slot 4), 14/14 under `--repeat-each=2`, tsc clean.

## New helper module

`support/admin-tools-help.ts`:
- `mockSessionPropertiesTokenFeatures(page, features)` — port of the enterprise
  helper (merge into `token-features` on GET `/api/session/properties`).
- `executeCreateGrantAccessFlow(page, {durationOption, ticket, notes})` —
  spec-local flow (open grant modal → set fields → submit → assert toast).

Imports (read-only) from shared: `undoToast` (metrics.ts), `icon`/`modal` (ui.ts),
`resolveToken` (api.ts).

## Fixes classified

- **Mantine Modal root is zero-size → `toBeVisible()` reads hidden** (KNOWN class:
  select-on-the-visible-thing, not the wrapper). `data-testid="grant-access-modal"`
  sits on `mb-mantine-Modal-root`, a fixed/zero-extent positioning container whose
  children are the actual overlay/content. Upstream's
  `cy.findByTestId("grant-access-modal").should("be.visible")` passed because
  Cypress visibility treats a wrapper as visible when a descendant is; Playwright
  checks the element's own box. Gate on the modal's visible heading
  ("Grant Access?") instead. Cost 1 iteration (4 grant tests failed identically).
  Not a product bug — the modal opens fine (a `role=dialog` is in the a11y tree).

- **Mantine Select option** picked via `getByRole("listbox").getByRole("option", …)`
  rather than clicking the text div (existing wave-10 gotcha; applied pre-emptively).

## Gating notes (no product findings)

- The `@OSS`-tagged first describe was ported to **run unconditionally**, not
  skipped. Its only assertion is the free-plan `/help` link (no `diag`), driven by
  `getIsPaidPlan` (token-status), not by the OSS-vs-EE build — so it is identical on
  the EE spike backend with no token. Confirmed passing on the jar. (Contrast with
  embedding-smoketests, which gated its @OSS test because the *upsell copy* differs;
  no such copy here.)

- The "Helping hand" section's cloud-only visibility is driven by whether the
  **active token** grants `support-users` (cloud tokens do — starter/pro-cloud show
  it; pro-self-hosted does not), read from the settings **bootstrap**, which the
  session-properties intercept does not reach. So `mockSessionPropertiesTokenFeatures`
  is ported faithfully but is effectively inert for section visibility — the real
  discriminator is the token, matching upstream. Verified on the jar: pro-self-hosted
  → hidden, starter/pro-cloud → visible.

## Not verified / caveats

- Jar version tag renders as `vUNKNOWN` (local jar `751c2a98`); both help-link
  regexes only require `v…`, so this is tolerated. The premium regex's `&diag=%7B…%7D`
  requirement is met (diag payload present).
- Ran with `TZ=US/Pacific` (CI's TZ) for the `dayjs().format("MMM D, YYYY")` cell
  assertion in the ticket/notes test.
