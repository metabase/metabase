# permissions-reproductions

Port of `e2e/test/scenarios/permissions/permissions-reproductions.cy.spec.ts`
→ `tests/permissions-reproductions.spec.ts`. 5 tests (issues 11994 ×2, 39221 ×2
parametrized admin/normal, 76710). Verified on the jar (slot 5): 5/5 green,
10/10 under `--repeat-each=2`, tsc clean. No new helpers (all reused read-only).

## Fixes classified

- **Known gotcha (wave-10, disabled-ancestor click).** issue 11994's combo test
  clicks `cy.icon("table2")` ("Switch to data"). For the readonly/view-only user
  that svg lives inside a **disabled button**, so Playwright refused the click
  ("element is not enabled"). Cypress clicks the svg regardless → `click({ force:
  true })`. The test only asserts URL-unchanged + no Save button, so a no-op
  click is fine.

- **Known gotcha (cy.wait consumes past responses).** issue 39221 anchors on
  `cy.wait("@sessionProperties")` *after* clicking "View SQL". On the jar the
  click fires **no** `/api/session/properties` — it fires `POST
  /api/dataset/native` (+ `GET /api/native-query-snippet`). Cypress's wait was
  satisfied retroactively by the page-load session/properties. Re-anchored on
  `POST /api/dataset/native` (the true trigger — the SQL preview running its
  compiled query). The product assertion (`GET /api/setting`, the all-settings
  fetch, never fires) was correct as-is and holds on the jar for both users.

## Dividends

None. No product bug found; the two fixes are harness-semantics adaptations, not
app behaviour. The 39221 regression guard (opening the SQL preview must not
trigger a full site-settings fetch) is intact and verified on the jar — the
click's only `/api/` traffic is the native dataset query and the snippet fetch.

## Notes

- `updatePermissionsGraph` / `ALL_USERS_GROUP` imported read-only from
  `dashboard-repros.ts`; `DataPermission`/`DataPermissionValue` enums inlined as
  their string values (`view-data`/`create-queries`,
  `unrestricted`/`blocked`/`query-builder`) — same values already used there.
- issue 76710 is token-gated (`resolveToken("pro-self-hosted")`, jar activates
  it); `cy.signIn("none")` → `signInWithCachedSession` (the "none" user isn't in
  the typed USERS map). FK-target-field 403 + table renders confirmed.
- `metabase-types/api` isn't resolvable from the e2e-playwright tsconfig — field
  refs are plain inline tuples, matching the click-behavior.ts convention.
