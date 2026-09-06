# theme-upsell

Source: `e2e/test/scenarios/embedding/embedding-theme-editor/theme-upsell.cy.spec.ts` (198 lines, 5 tests)
Target: `e2e-playwright/tests/theme-upsell.spec.ts`
Helpers: `e2e-playwright/support/theme-upsell.ts` (new; shared modules untouched)

Result: **5/5 executed and passing on the CI uberjar** (`target/uberjar/metabase.jar`,
COMMIT-ID `751c2a98`, backend `version.hash` `751c2a9` confirmed on :4104).
10/10 under `--repeat-each=2`. `bunx tsc --noEmit` clean.
**Zero gate-skips** — all three describes ran (see gating note below).
No product bugs found; no `test.fixme`.

---

## Dividend 1 — the `store-users` intercept in two Starter tests is a no-op

Upstream tests 3 and 4 (`"…when the current admin is a Metabase Store Admin"` and
`"shows the Try for free CTA and trial copy…"`) both open with:

```js
cy.log("inject the current admin into token-status.store-users so isStoreUser becomes true");
cy.intercept("GET", "/api/session/properties", …store-users: [{ email: "admin@metabase.test" }]…);
```

That intercept changes nothing observable in this spec.

**Mechanism** (`frontend/src/metabase/common/components/upsells/components/UpsellCardContent.tsx:148`):

```ts
const shouldShowContactAdmin = isHosted && !isStoreUser && !isAdmin;
```

`isStoreUser` has exactly one consumer in the rendered tree — `shouldShowContactAdmin` —
and it is `&&`-ed with `!isAdmin`. The spec signs in via `cy.signInAsAdmin()`, so
`isAdmin` is true and the contact-admin fallback is unreachable **whatever**
`store-users` contains. The CTA branch (`!shouldShowContactAdmin`) is therefore
already taken without the intercept, contradicting test 4's own comment
("admin is a Store Admin, so the CTA branch is taken").

`useUpgradeAction` (the other thing that could branch here) keys off `is-hosted?`
and the URL only — no store-user dependency.

**Verified by control**, not just by reading: with `mockCurrentAdminAsStoreUser`
removed, both tests still pass on the jar (test 3: 1.3s ✓, test 4: 1.5s ✓).

Consequences, stated plainly:

- Upstream tests 2 and 3 ("not a Store Admin" / "is a Store Admin") are
  **behaviourally identical** — they differ only in a mock that has no effect.
- The `Please ask a Metabase Store Admin (…) to upgrade your plan.` branch has
  **no e2e coverage at all**. Reaching it needs a hosted, non-admin, non-store
  user — but `/admin/embedding/themes` is admin-only, so it is probably not
  reachable on this route at all and belongs in the existing unit tests for
  `UpsellCardContent` rather than here.

Scope caveat: this is a **test-coverage** finding about the Cypress spec. It is
not a product-bug claim — the component behaves exactly as its source says. I did
not check whether other upsell surfaces (non-admin routes) exercise the fallback.

**The port keeps the intercept**, faithfully, rather than dropping it — the
upstream intent is documented and a future change to `shouldShowContactAdmin`
would make it load-bearing again.

## Dividend 2 — three vacuous `should("not.exist")` checks ported as real assertions

Per PORTING.md, `should("not.exist")` is a one-shot absence check, so an absence
asserted inside a mount-lag window passes by construction. Three here sat in
exactly that window; the port makes them real by ordering the render-gating
positive assertion first (no assertion was dropped or weakened):

1. **Pro / "upsell copy is absent"** — `EmbeddingThemeListingApp` renders a bare
   `<Loader/>` while `useListEmbeddingThemesQuery` is in flight, during which
   `Metabase Pro` and the `Create custom themes` heading are trivially absent.
   Port asserts the `Themes` heading + `New theme` button **first**, then the
   absences. Still green (2/2).
2. **Starter / "contact-admin fallback is not rendered"** and
3. **Starter / "no trial → no trial line"** — both are rendered from
   `useCheckTrialAvailableQuery` state that only exists after the cloud-proxy POST
   resolves. Port awaits that response (`page.waitForResponse` on
   `/api/ee/cloud-proxy/mb-plan-trial-up-available`) before asserting absence.
   Still green (2/2).

(#2 is *also* the one shown vacuous by Dividend 1 — the ordering fix makes it a
real check of the render, but it still cannot fail for an admin user.)

## Gating note — the `@OSS` describe is genuinely build-agnostic, so it runs

PORTING.md's default for `@OSS` is an `isOssBackend(mb.api)` skip. That is **not**
needed here, and applying it would have silently thrown away a fifth of the
coverage on our EE-only jar. Checked against source:

- With no token active, every entry in `token-features` is false, so
  `getPlan()` (`frontend/src/metabase/common/utils/plan.ts:11`) returns `"oss"` —
  which is what the `source_plan=oss` assertion needs.
- `is-hosted?` is false, so `useUpgradeAction` returns a `url` (not an
  `onClick`), so `UpsellCta` renders an `ExternalLink` → `role="link"` — which is
  what the `findByRole("link", …)` + `href` assertions need.

Both hold on an EE build without a token, so the describe executes as written on
the jar and passed 2/2. Worth generalising: an `@OSS` describe whose assertions
only depend on *plan derived from token features* is executable on the EE jar;
only assertions depending on the **build** (routes/components absent from OSS)
need the skip.

## Mechanical notes (no dividend, just for the record)

- All four `cy.intercept`s are pure stubs never awaited by alias → `page.route`
  handlers registered before `page.goto` (rule 2). The one new wait
  (`CLOUD_TRIAL_PATH`) is registered before the `goto` that triggers it.
- `GET /api/session/properties` patch uses native `fetch`, not `route.fetch()` —
  the bun set-cookie workaround already established by
  `mockSessionPropertiesTokenFeatures` (admin-tools-help.ts).
- `cy.icon("gem").should("be.visible")` → `.filter({ visible: true }).first()`
  (rule 3 any-match).
- `should("have.attr","href").and("include", …)` chains → one `getAttribute` +
  two `toContain`s. (Note this is *not* the boolean-attribute trap — `href`
  carries a real value.)
- `mb.restore()` does clear `premium-embedding-token`: under `--repeat-each=2`
  the OSS test runs immediately after the Pro test and still sees
  `source_plan=oss`.

## Consolidation candidate

`support/theme-upsell.ts mockCurrentAdminAsStoreUser` is the third copy of the
"passthrough-and-patch `/api/session/properties`" shape
(`mockSessionPropertiesTokenFeatures` in admin-tools-help.ts, `mockSessionProperty`
in admin-extras.ts, this one). Cypress has one helper + ad-hoc `req.continue`s, so a
single parameterised `patchSessionProperties(page, patch)` would be faithful.
