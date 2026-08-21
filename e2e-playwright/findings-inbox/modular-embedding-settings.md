# modular-embedding-settings — port findings

Slot 5 (:4105), jar mode. Backend verified: `version.hash = 751c2a9` vs
`target/uberjar/COMMIT-ID = 751c2a98`, real `java -jar` process.

Source: `e2e/test/scenarios/embedding/modular-embedding-settings.cy.spec.ts`
(32 lines, 2 tests) → `tests/modular-embedding-settings.spec.ts`.

## Provenance: inherited partial, verified and kept unchanged

This file was already on disk from a cancelled previous agent, state UNKNOWN. It
was read against the Cypress original, judged faithful, and **verified on the
jar rather than assumed**: 2/2 green, 4/4 under `--repeat-each=2`, and the tier
claim in its header re-tested independently (below). **Kept as-is — no edits.**

## Numbers

- **2 executed, 0 gate-skipped, 0 fixme.**
- **2/2 green**; **4/4 under `--repeat-each=2`**.
- `bunx tsc --noEmit` clean.
- No support-module changes; no companion support module.

## Is the EE tier gate real? YES

Upstream is tagged `@EE` and activates `pro-self-hosted`. The "Tenants" row in
`RelatedSettingsSection` renders only when `isTenantsFeatureAvailable`, and
`/admin/embedding/modular` is itself an EE-plugin route. Since `mb.restore()`
clears the token on this EE jar, `activateToken("pro-self-hosted")` **is** the
whole gate — there is nothing to `test.skip`, and both tests execute.

**Mutation confirming the second test's own input:** drop
`updateSetting("use-tenants", true)` and test 2 fails with
`Expected: "/admin/people/tenants", Received: "/admin/people/user-strategy"`.
Test 1 correctly survives that mutation — it asserts the
tenants-disabled default. So the two tests genuinely discriminate the two
states, which is the whole content of this spec.

## Port notes worth keeping

- `.closest("a")` has no Playwright equivalent. `xpath=ancestor::a[1]` is the
  exact same "nearest enclosing anchor" walk and is what the port uses.
- `.scrollIntoView()` → `scrollIntoViewIfNeeded()`, kept because upstream's next
  assertion is `should("be.visible")` — Cypress visibility is
  in-viewport-flavoured whereas Playwright's `toBeVisible()` does not require the
  viewport, so the scroll is the faithful half of that pair.
- `findByText("Tenants")` is an EXACT match (rule 1) and testing-library throws
  on multiple matches, so `{ exact: true }` scoped under `main` is unique.
