# Reconstruction report — metabase#33379 (FE)

_Verbatim final report (a75926a8df7fda169)._

---

Reconstruction complete and verified. Here is the report.

## 1. Diff (`frontend/src/metabase/visualizations/lib/open-url.ts`)
Three-line semantic revert of the fix's core hunks (hand-reconstructed against drifted code, NOT `git apply -R`):
- Added `const isOriginalUrlAbsolute = url.startsWith("/");` before `getWithSiteUrl` (pre-fix `isAbsoluteUrl` semantics).
- Branch condition `if (!isMetabaseUrl(url))` → `if (isOriginalUrlAbsolute)` — so leading-slash in-app URLs take the `clickLink` full-page-reload path instead of client-router `push`.
- `getLocation` returns raw `pathname` instead of `getPathnameWithoutSubPath(pathname)` — so subpath URLs keep the subpath in the pushed pathname.

## 2. Oracle results
- Oracle spec: `frontend/src/metabase/visualizations/lib/action.unit.spec.ts` (run via `bun run test-unit-keep-cljs` from worktree root).
- Baseline (fixed): `Tests: 44 passed, 44 total`
- Reconstructed (bug reintroduced): `Tests: 23 failed, 21 passed, 44 total`

## 3. Failure shape
Proper assertion failures, two flavors:
- Leading-slash URLs (`/`, `/question/1`, `/question/1/`): `expect(dispatch).toHaveBeenCalledTimes(1)` → `Received number of calls: 0`. The URL now goes through `clickLink` (full reload), so no router `push` is dispatched — this is exactly bug #33379 ("click behavior link to dashboards/questions not using client router").
- Subpath site URLs (absolute-URL-containing-site-URL tests): `toHaveBeenCalledWith` mismatch — `pathname: "/metabase/path//auto/dashboard/adhoc/123Abc"` vs expected `"/auto/dashboard/adhoc/123Abc"` (subpath not stripped).

## 4. Confidence + adversarial reasoning
High confidence.
- Failures are assertion failures (`toHaveBeenCalledTimes`/`toHaveBeenCalledWith`), not compile/import/arity errors — jest ran and 21 tests still pass, including the unrelated `onUpdateQuestion` question-change test.
- Baseline PASS was confirmed before editing; only the two bug hunks were touched.
- The reintroduced behavior maps directly to the bug's semantics: in-app absolute-path navigation reverts from client router to a hard link/reload.
- Product-only change; the spec was not modified. The drift (module split `dom.js`→`open-url.ts`+`utils/dom.ts`, `isMetabaseUrl` gaining public/embed handling, async `openUrl`, optional `openInSameOrigin`, spec moved to `.ts` with `dispatch` expected once not twice) was handled by reconstructing pre-fix logic in place rather than reverting the commit.

## 5. Ambiguity
Minor and non-blocking: the fix touched multiple hunks (`isAbsoluteUrl`, branch, `getLocation`). I reverted the two behavior-bearing ones needed to reproduce the bug and left `isMetabaseUrl`/`isAbsoluteUrl` defined-but-unused (harmless for the jest oracle, which transpiles without type-checking). The invalid-URL test still passes post-revert (its expected pathname is unaffected by subpath stripping), which is expected and does not weaken the reconstruction — the leading-slash failures are the primary, faithful bug signal.

No `reconstruction_failed`.
