The reconstruction is complete and the oracle flips cleanly. The diff is left in the worktree.

## 1. git diff (semantic revert)
`frontend/src/metabase/redux/downloads.ts` — `getDatasetDownloadUrl`:
```diff
   const basename = getBasename();
-  if (basename && url.startsWith(basename)) {
-    url = url.slice(basename.length); // make url relative if it's not
-  }
+  url = url.replace(basename, ""); // make url relative if it's not
+  url = basename + url;
   if (params) {
     url += `?${params.toString()}`;
   }
-  return url;
+  const requestUrl = new URL(url, location.origin);
+  return requestUrl.href;
```
This re-introduces the historical bug (#41633): instead of stripping the subpath basename and returning a relative URL, it re-prepends the basename and resolves to an absolute `URL.href`. That is exactly the pre-fix code path (which caused the download request to bypass `metabase/lib/api`'s header injection, since an absolute cross-origin-looking URL / doubled subpath was passed to a raw `fetch`).

## 2. Oracle
- Spec (RELOCATED): `frontend/src/metabase/redux/downloads.unit.spec.ts` — descendant of the fix's shipped `frontend/src/metabase/query_builder/actions/downloading.unit.spec.ts` (product logic + spec were module-extracted from `query_builder/actions/downloading.ts` into `redux/downloads.ts`).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/redux/downloads.unit.spec.ts`
- Baseline (clean HEAD): PASS — Tests: 15 passed, 15 total.
- Reconstructed: FAIL — Tests: 3 failed, 12 passed, 15 total.

## 3. failure_shape
Clean value mismatches (not compile/import errors):
- `getDatasetResponse › subpath deployment › should handle absolute URLs` — Expected `"/embed/question/123.xlsx"`, Received `"http://localhost/mb/embed/question/123.xlsx"`.
- `getDatasetResponse › subpath deployment › should handle relative URLs` — same expected vs received.
- `getDatasetResponse › normal deployment › should handle relative URLs` (line 29) — Expected relative, Received absolute `http://localhost/...`.

## 4. Confidence + adversarial
High confidence the failure isolates the reverted URL-normalization behavior. All 12 sibling tests in the same file stay green: `getDatasetParams` (embed/public param construction), `readDownloadBlob`, and `getChartFileName` — none touch `getDatasetDownloadUrl`, so this is not a blunt module break. Notably the "normal deployment / absolute URL" case still passes (absolute input with empty basename resolves to the identical href), which shows the mutation only perturbs the basename-stripping/relative-return contract rather than crashing the function — a precise behavioral flip.

## 5. Outcome
`kill` — a surviving discriminating jest spec catches the reintroduced bug via a clean value assertion. Oracle relocation noted: `query_builder/actions/downloading.unit.spec.ts` → `redux/downloads.unit.spec.ts`. No new test needed; existing regression protection is intact. Diff left in the worktree.