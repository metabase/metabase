# tenant-users-sidecar

Source: `e2e/test/scenarios/embedding/tenant-users-sidecar.cy.spec.ts` (199 lines, 4 tests)
Target: `e2e-playwright/tests/tenant-users-sidecar.spec.ts` + `support/tenant-users-sidecar.ts`

**Result: 4/4 passing on the CI EE uberjar (`target/uberjar/COMMIT-ID` 751c2a98,
verified `/api/session/properties` `version.hash` = `751c2a9` on slot 4102),
8/8 under `--repeat-each=2`. `bunx tsc --noEmit` clean. Zero fixmes, zero
gate-skips (the EE token resolves locally, so all 4 genuinely execute).**

**No product-bug dividends.** The port was clean first try — no debugging loop, so
no Cypress cross-check was needed (the fidelity cross-check is only invoked to
justify a fixme or a bug claim, and neither arose).

## Vacuity audit (the only thing worth recording)

The upstream spec has one test whose whole point is a *negative* — "tenant users
should not see the synced collection icons" — so a broken git-sync setup would make
it pass for the wrong reason. I checked rather than assumed:

- Probe against the jar after the spec's own setup:
  `GET /api/collection/<sharedCollection1Id>` returns **`"is_remote_synced": true`**.
  So the collections really are marked synced at assertion time.
- The app's gate is `isSyncedCollection(collection) && !isTenantUser`
  (`frontend/src/metabase/common/collections/utils.ts:414`, with the comment
  "tenant users see the normal icon"). With `is_remote_synced` true, the tenant-user
  branch is the only thing suppressing the icon.

Conclusion: the test is meaningful, not vacuous. Recording it because the same
shape ("negative assertion whose setup could silently no-op") is cheap to audit and
easy to ship broken.

I also mutation-checked the port itself: temporarily corrupting the `People` popover
text, the `"Our data"` heading text, and the `folder` icon name failed exactly the 3
tests carrying them (the 4th, unmutated, stayed green). So none of the 4 tests are
passing on a locator that resolves to nothing.

## FINDINGS #45 — no new evidence either way

#45 is about tenant collections leaking into **entity-picker search** because
`/api/search?context=entity-picker` omits `namespace`. This spec never searches: its
one entity-picker interaction (test 4) *browses* into "Shared collections" and reads
an icon. Nothing here confirms or weakens #45. Stating that explicitly so the absence
isn't read as a silent corroboration.

## Port notes (mechanical, for the consolidation pass)

- `cy.task("signJwt")` → `signJwt` from `support/interactive-embedding.ts`, but with
  an explicit **`iat`**. Upstream signs with `jsonwebtoken` (`e2e-jwt-tasks.ts`),
  which stamps `iat` automatically; the local HS256 port adds no claims, and the
  backend unsigns with `{:max-age three-minutes-in-seconds}`
  (`enterprise/.../sso/providers/jwt.clj:73`). Worth knowing for any future JWT port
  — this is a latent difference between the two signers, not specific to this spec.
- The `/auth/sso?jwt=…` hop is the **app's own** redirect against the real backend,
  not a mocked one, so the "Playwright does not route the follow-up request of a
  redirect" gotcha does not apply: a plain `page.goto` follows it and the session
  cookie lands. (Worth saying, because the gotcha reads as if it applies to every
  JWT SSO port; it only applies when the IdP hop is `page.route`-mocked.)
- `.closest("li")` / `.closest("a")` have no Playwright equivalent. `filter({ has })`
  matches the whole ancestor chain; matches come back in **document order
  (outermost first)**, so **`.last()` is the innermost** — exactly `closest()`.
  Helpers `sidebarCollectionItem` / `pickerRowLink` in
  `support/tenant-users-sidecar.ts`. The `has` text locator is built from `page`,
  never from the scope (wave-11 gotcha).
- `cy.icon(n).should("be.visible")` ported as the ANY-of-set form
  (`.filter({ visible: true }).first()`, PORTING rule 3) via `expectIconVisible`.
- The three `should("not.exist")` checks (External/Internal collections, the
  `synced_collection` icon) are each preceded by a retrying positive assertion that
  gates the render, so the retrying `toHaveCount(0)` form is safe here rather than
  stronger-than-upstream-and-flaky.
- `H.setupGitSync()` + `H.LOCAL_GIT_PATH + "/.git"` → the temp-repo form in
  `support/remote-sync.ts`; `repo.url` is already the `file://…/.git` URL. Added a
  `teardownGitSync` in a `finally` that upstream does not have (upstream reuses one
  fixed path and `rm -rf`s it on next setup).
- Upstream's test 4 re-calls `cy.signInAsAdmin()` although the `beforeEach` already
  did; dropped as a no-op with a comment.

## Reusable helper surface added

`support/tenant-users-sidecar.ts` (new module, per rule 9 — no shared module edited):
`GIZMO_TENANT` / `GIZMO_USER` / `Tenant` / `TenantUser`, `loginWithJWT`,
`createTenant`, `sidebarCollectionItem`, `pickerRowLink`, `expectIconVisible`.

Consolidation candidates for a later pass (not acted on):
- **`expectIconVisible`** is the generic ANY-of-set `cy.icon(...).should("be.visible")`
  port and belongs in `ui.ts` next to `icon`.
- **`sidebarCollectionItem` / `pickerRowLink`** are two instances of one primitive:
  a `closest(selector)` equivalent. A shared `closest(page, scope, selector, text)`
  in `ui.ts` would serve both and any future `.closest()` port.
- **`loginWithJWT`** (the un-mocked `/auth/sso?jwt=` sidecar login) is distinct from
  `sdk-iframe.ts`'s `mockAuthProviderAndJwtSignIn` (the mocked-IdP embedding flow).
  Both belong in one JWT module; today `JWT_SHARED_SECRET` lives in `sdk-iframe.ts`
  and `signJwt` in `interactive-embedding.ts`, which is why this module imports from
  two unrelated spec modules.
