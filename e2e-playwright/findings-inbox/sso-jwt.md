# sso-jwt (port of e2e/test/scenarios/admin-2/sso/jwt.cy.spec.js)

**Result: no dividends.** 7/7 upstream tests ported 1:1, all executed (none
gate-skipped), green on the CI uberjar (`COMMIT-ID 751c2a98`, confirmed via
`/api/session/properties` `version.hash = 751c2a9` on :4102), 14/14 under
`--repeat-each=2`, `bunx tsc --noEmit` clean for both new files.

No product bug, no vacuous upstream assertion, no Cypress-masked behaviour.
Nothing here needed a cross-check, a `test.fixme`, or a workaround.

## Reuse notes (the only thing worth carrying forward)

- **The group-mappings driver ported for SAML worked for JWT with zero
  modification.** `support/sso-saml.ts`'s `crudGroupMappingsWidget` /
  `checkGroupConsistencyAfterDeletingMappings` are parameterised by auth
  method exactly like upstream's `shared/group-mappings-widget.js`, and both
  JWT tests passed on the first run against them. Verified the shape actually
  matches rather than assuming: `GroupMappingsWidget.tsx` dispatches the redux
  `updateSetting({ key: "jwt-group-mappings", … })`, i.e. `PUT /api/setting/:key`
  — the same endpoint the SAML port's `waitForMappingSettingPut` waits on. This
  is a genuine data point that the port is method-agnostic, not just that it
  compiled.
- `enableJwtAuth` (the port of `e2e-jwt-helpers.ts`) already existed in
  `support/sdk-iframe.ts` and is reused as-is. `typeAndBlurUsingLabel` and
  `goToAuthOverviewPage` are reused from `support/sso-saml.ts`.
- `support/sso-jwt.ts` is therefore only `getJwtCard` plus the two
  `waitForResponse` alias helpers.

## Consolidation candidate (for the later pass)

The SSO admin-settings surface is now spread over three modules:
`sso-saml.ts` (group-mappings driver, `typeAndBlurUsingLabel`,
`goToAuthOverviewPage`, `visitAuthSettings`), `sdk-iframe.ts`
(`enableJwtAuth`/`enableSamlAuth`, JWT signing) and `sso-jwt.ts`. Upstream has
exactly one copy of each of these, so collapsing them into `support/sso.ts`
stays faithful (the "only consolidate toward a shape Cypress already has"
rule). The SAML port's own header already flags this. Not done here because
`sso-saml.ts` was being edited concurrently by another agent — the JWT spec
imports from it rather than duplicating it, per the brief.

The LDAP spec (`admin-2/sso/ldap.cy.spec.js`) is the third consumer of the same
shared widget and should land against the same driver.

## Small fidelity decisions, recorded

- `getJwtCard()` upstream is
  `findByTestId("admin-layout-content").findByText("JWT").parent().parent()`.
  Ported as `getByTestId("jwt-setting")` — provably the same element:
  `AuthCard.tsx:127` renders `data-testid={`${type}-setting`}` on `CardRoot`,
  the CardTitle's grandparent, and `JwtAuthCard.tsx` passes `type="jwt"`. Same
  substitution the SAML port made.
- Upstream's `should("exist")` on card badges is ported as `toBeVisible()`,
  matching the SAML port. Mild strengthening; all pass.
- `SetupKeyModal` generates the key asynchronously (`useMount` →
  `/api/util/random_token`) and its **Done** button is `disabled` until the
  token lands. Cypress's click-retry covered the window implicitly; the port
  asserts `toBeEnabled()` first. This is the "assert enabled before toggling an
  admin control" rule from PORTING applied to a modal button — cheap, and it
  removes a latent CI-load flake rather than papering over one (it never failed
  locally).
- The JWT `iat` hazard from the brief did **not** apply: this spec never signs
  or presents a token, it only drives the admin settings page. Recording that
  so the next reader does not go looking for it.

## Auth-state hygiene

No `afterEach` restore was added, and none is needed: every test mutates `jwt-*`
settings (and the mapping tests delete the `data`/`nosql` permission groups),
but the `beforeEach` `mb.restore()` resets the whole app DB including the
`setting` and `permissions_group` tables, so a mid-test failure cannot poison
the slot for the next spec. Verified empirically — three consecutive runs on the
same kept slot backend (7, then 14 under `--repeat-each=2`) with no drift.
