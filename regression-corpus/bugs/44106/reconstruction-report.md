The reconstruction is complete and the diff is left in the worktree. Here is the report.

---

## 1. git diff — semantic revert

`frontend/src/metabase/dashboard/selectors.ts` — neutralized `getInitialSelectedTabId` so it ignores the `?tab=` URL slug and always falls back to the first tab (the pre-fix behavior that caused bugs #34447/#44106):

```
 function getInitialSelectedTabId(dashboard, siteUrl, isWebApp) {
-  const pathname = window.location.pathname.replace(siteUrl, "");
-  const isDashboardUrl = pathname.includes("/dashboard/");
-  if (isDashboardUrl) {
-    ... parse ?tab= param, find matching tab, return tabId ...
-  }
   return dashboard.tabs?.[0]?.id || null;
 }
```

## 2. Oracle

- Spec: `frontend/src/metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboardPage/tests/PublicOrEmbeddedDashboardPage.common.unit.spec.tsx`
- Command (from worktree root): `bun run test-unit-keep-cljs <spec-path>`
- Baseline (clean HEAD): **8 passed, 0 failed**
- Reconstructed (mutation applied): **2 failed, 6 passed**

## 3. failure_shape

- `PublicOrEmbeddedDashboardPage › should select the tab from the url` — `?tab=2`, `Tab 2` expected `aria-selected="true"`, received `"false"`.
- `PublicOrEmbeddedDashboardPage › should work with ?tab={tabid}-${tab-name}` — `?tab=2-this-is-the-tab-name`, `Tab 2` expected `aria-selected="true"`, received `"false"`.

Both are clean DOM-attribute mismatches, not compile/import errors.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. The sibling test `should default to the first tab if the one passed on the url doesn't exist` (`?tab=1111`) stays **green** — because both the fixed and bugged code return the first tab for a non-existent slug, so it can't discriminate. The two tests that flip are precisely the ones asserting selection of a *non-first* tab from the URL, which is the exact capability `getInitialSelectedTabId`'s URL-parsing branch provides. The other 6 tests (dashboard rendering, header, filters, empty state) remain green, confirming this is a surgical behavioral revert, not a blunt module break. The mutation reproduces the user-visible symptom of #34447/#44106: click-behavior navigation to a dashboard tab always landed on the first tab.

## 5. Outcome

**kill.** The load-bearing behavioral fix (`getInitialSelectedTabId` reading the `?tab=` slug from `window.location`) is guarded by a surviving jest spec. Oracle relocation: the fix shipped edits to `.../PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboardPage.unit.spec.tsx`; that spec was later moved into a `tests/` directory and split into `common`/`premium`/`enterprise` variants (`PublicOrEmbeddedDashboardPage.common.unit.spec.tsx`), with the window-location setup extracted to `tests/setup.tsx`. The three tab-from-URL tests (`should select the tab from the url`, `should work with ?tab={tabid}-${tab-name}`, `should default to the first tab...`) survived intact and discriminate the fix. No new test is needed — existing unit coverage already catches this regression.

Note: the full Cypress repro (`click-behavior.cy.spec.js:2580`, "navigate to correct dashboard tab via custom destination click behavior") additionally exercises the click→navigate→slug-in-URL round-trip (via `createTabSlug`/`useDashboardUrlQuery`), but the tab-selection half of the fix — the actual bug's root cause — is fully unit-killable, so this classifies as a kill rather than cypress_only.