# Reconstruction report — metabase#43800 (FE)

_Verbatim report (af2a226ca7262c425)._

---

Reconstruction determination: **`reconstruction_failed`** — honest-negative, category **`no_unit_oracle__real_oracle_cypress`**.

## What I found

The fix commit `f106ffa7` touched `AppBar.unit.spec.tsx`, but the change was **purely mechanical**: every `render(<AppBar {...props} />)` was swapped to `renderWithProviders(...)` (plus the import line). This was forced by AppBarLogo starting to call a redux-backed hook (`useHomepageDashboard` in the original fix; now the drifted `useIsAtHomepageDashboard`) — the plain RTL `render` broke because the component tree now needs a Redux store. **No behavioral assertion of the bug fix was added to this spec.**

The spec only asserts that testids render (`main-logo`, `sidebar-toggle`, `search-button`, `collection-path`, etc.). There is no click simulation, no `preventDefault`, no navigation/redirect assertion — confirmed by grep: the only `dashboard` matches are test-title text ("saved questions and dashboards").

The actual behavioral oracle for bug #43800 is the Cypress spec added in the same commit:
`e2e/test/scenarios/onboarding/home/homepage.cy.spec.js` → *"should not redirect when already on the dashboard homepage (metabase#43800)"* (asserts pathname stays `/dashboard/:id`, `query_metadata`/`dashcard query` fire exactly once, no "Something's gone wrong"). Grep confirms `43800` exists only in that e2e file — no unit spec anywhere covers the click/`canNavigate`/`isAtHomepageDashboard` logic.

## Why no target-file revert can make the oracle fail
- `HomePage.tsx` — not in the AppBar render tree; reverting it cannot affect `AppBar.unit.spec.tsx`.
- `use-homepage-dashboard.tsx` — imported only by `HomePage.tsx`; AppBarLogo/MainNavbarView now consume the **moved** hook `use-is-at-homepage-dashboard.ts` (the `canNavigateHome` semantic was extracted into a separate hook and inverted to `isAtHomepageDashboard`). So neither named target file is reachable from the AppBar spec.

## Report
1. **git diff**: empty (no product edits; only untracked `target`/`node_modules` symlinks for the harness).
2. **Oracle results**: baseline `Tests: 8 passed, 8 total` (PASS). No reconstructed run — no target-file revert can produce an assertion failure in this oracle, so none was applied (avoiding thrash).
3. **failure_shape**: N/A — the named unit oracle contains no assertion that the bug behavior can flip. The only assertions are static render checks unaffected by the fix's logic.
4. **Confidence**: High. Adversarial reasoning: I verified (a) the spec's fix-diff was render→renderWithProviders only, (b) no click/preventDefault/redirect/43800 assertion exists in the spec, (c) neither target file is in the AppBar import graph (AppBarLogo uses the drifted `use-is-at-homepage-dashboard.ts`), and (d) the sole bug-#43800 oracle is the Cypress e2e spec.
5. **reconstruction_failed** — category `no_unit_oracle__real_oracle_cypress`. Reconstructable? The bug *behavior* is reintroducible in product code (drop the `event.preventDefault()`/`isAtHomepageDashboard` guard, or make HomePage's redirect fire unconditionally), but it is **not detectable by the assigned unit oracle** — only by `homepage.cy.spec.js`. Secondary drift note: the fix's `canNavigateHome` logic has moved out of `use-homepage-dashboard.tsx` into `use-is-at-homepage-dashboard.ts` (a moved-target), further decoupling the named targets from the named oracle.
