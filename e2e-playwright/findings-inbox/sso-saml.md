# sso-saml (port of e2e/test/scenarios/admin-2/sso/saml.cy.spec.js)

**Result: 7/7 executed and green on the CI uberjar (COMMIT-ID 751c2a98), 14/14
under `--repeat-each=2`. 0 skipped, 0 fixme, 0 upstream skip-carries.
`bunx tsc --noEmit` clean.**

## No dividends

No product bugs, no vacuous upstream assertions worth reporting, no
Cypress-masked behaviour. The port is a straight 1:1 translation; every fix
during stabilisation was my own drift, not the app's.

## Gate: the token gate was checked, not assumed

SAML is premium, so the describe carries
`test.skip(!resolveToken("pro-self-hosted"), ...)` (PORTING rule 7, FINDINGS
#49). On this box the token resolves from repo-root `cypress.env.json`, so all
7 tests **executed** — the counts above are executed-vs-gate-skipped, not an
exit code.

## Reusable notes

- **`getSamlCard()` ≡ `getByTestId("saml-setting")`.** Upstream's
  `findByTestId("admin-layout-content").findByText("SAML").parent().parent()`
  walks CardTitle → CardHeader → CardRoot, and CardRoot is where
  `data-testid="${type}-setting"` is set (`AuthCard.tsx`). Same single element;
  matches what `sso-google.ts` already does for the Google card. Worth knowing
  for the LDAP/JWT ports.
- **The SAML certificate field does not need the `invoke("val")` dance.**
  Upstream pastes the cert with `.invoke("val", cert)` then types `a{backspace}`
  purely to make React see the value. `fill()` sets the value *and* dispatches
  the input event Formik listens on, so it is one step and the same end state.
- **Anchor group-page absence checks on a group that survives.** The
  `/admin/people/groups` rows render group names inside a link whose accessible
  name includes the avatar initial — `"A All Users"`, `"C collection"`. An
  `exact: true` role-name anchor finds nothing (this was my one real failure).
  Match a substring, or anchor on the row testid (`group-<id>-row`).
- **`cy.wait(["@deleteGroup", "@deleteGroup"])` ported as a response counter**
  (`countResponses` in `support/sso-saml.ts`), per the PORTING rule that N
  concurrent `waitForResponse`s on one predicate all resolve on the first hit.
  Endpoints: `DELETE /api/permissions/group/:id`,
  `PUT /api/permissions/membership/:id/clear`.
- **Pacing added where Cypress's command queue supplied it for free:**
  `createMapping` now awaits the `PUT /api/setting/saml-group-mappings` and the
  row's appearance before continuing, and
  `checkGroupConsistencyAfterDeletingMappings` awaits the 2 group deletes that
  upstream fires and never waits on. Both are strictly additive gates on state
  the original also required; neither weakens an assertion.

## Consolidation candidate (for whoever ports LDAP / JWT)

`e2e/test/scenarios/admin-2/sso/shared/group-mappings-widget.js` is shared
upstream between the SAML, LDAP and JWT specs. I could not put it in a shared
support module (parallel agents), so the port lives in `support/sso-saml.ts`,
already parameterised by `authenticationMethod` exactly like the original:
`crudGroupMappingsWidget(page, method)` and
`checkGroupConsistencyAfterDeletingMappings(page, method)`, plus
`visitAuthSettings(page, method)`. When LDAP/JWT land, move these to a shared
`support/group-mappings.ts` rather than copying — Cypress has exactly one copy,
so consolidating stays faithful.

Also: `typeAndBlurUsingLabel` now exists twice — `sso-google.ts` (string labels
only) and `sso-saml.ts` (accepts `string | RegExp`, which the SAML spec needs
because it matches `/SAML Identity Provider URL/i` against a rendered
"SAML identity provider URL"). The RegExp-accepting version is a strict
superset; collapse to it at consolidation.

## What I did NOT verify

- No Cypress cross-check was run — nothing failed, so there was nothing to
  establish fidelity *for*.
- The port never drives a real SAML round-trip (neither does the original). The
  IdP URL/issuer/certificate are the repo's dummy fixtures; enable/pause/reset
  are backend-local setting writes. Nothing here exercises the SAML login flow,
  so it says nothing about `sso/providers/saml`.
- Auth-state restoration: verified only indirectly — `mb.restore()` runs in
  `beforeEach`, and two consecutive full passes (`--repeat-each=2`) were green
  with the slot backend reused, including the tests that delete the `data` and
  `nosql` groups. The slot answered `/api/health` ok afterwards.
