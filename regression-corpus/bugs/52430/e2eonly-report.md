Done. Both the product mutation and the witness are left applied in the worktree.

## Report

### 1. git diff (product mutation)
`frontend/src/metabase/redux/downloads.ts`, in `getEmbedQuestionParams` (~line 388):
```diff
   const downloadParameters = isEmbeddingSdk()
     ? params
-    : convertSearchParamsToObject(new URLSearchParams(window.location.search));
+    : Object.fromEntries(new URLSearchParams(window.location.search));
```
This is the faithful semantic revert of fix commit `ced4a5ec`. The fix replaced `Object.fromEntries(params)` with a helper that accumulates repeated keys into arrays; the current code names that helper `convertSearchParamsToObject`. `Object.fromEntries` on a `URLSearchParams` with duplicate keys keeps only the **last** value, which is precisely the bug. (`convertSearchParamsToObject` is now unused but left in place; it doesn't affect the jest run.)

### 2. Witness
Added to `frontend/src/metabase/redux/downloads.unit.spec.ts` in the existing "getDatasetParams - embed question (token-based)" describe block:
```ts
it("preserves all values when a static embed field filter has multiple values (metabase#52430)", async () => {
  await mockIsEmbeddingSdk(false);
  setLocationSearch("?state=CA&state=NY&state=TX");

  const downloadParams = getDatasetParams({
    type: "csv",
    question,
    result,
    token: TOKEN,
    params: {},
  });

  const url = new URLSearchParams(downloadParams.params);
  expect(JSON.parse(url.get("parameters") ?? "")).toEqual({
    state: ["CA", "NY", "TX"],
  });
});
```
Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/redux/downloads.unit.spec.ts -t "metabase#52430"`
- PASS on clean HEAD (`convertSearchParamsToObject`): 1 passed.
- FAIL on mutant (`Object.fromEntries`): `Expected {state: ["CA","NY","TX"]}` but `Received {state: "TX"}` — only the last value survives.

### 3. Bug summary
When a static-embedded question is downloaded (CSV/XLSX/JSON) and a field filter has multiple selected values (e.g. `?state=CA&state=NY&state=TX`), the download request collapsed the repeated query-string keys to only the last value. The exported file was therefore filtered by a single value instead of all selected values. This is what the e2e repro `embed-resource-downloads.cy.spec.ts` ("...when field filters has multiple values (metabase#52430)") checks.

### 4. Outcome
`witness_authored` — the bug is fully unit-catchable, so the e2e is replaceable at the unit level. The relevant logic (`getDatasetParams` -> `getEmbedQuestionParams`) is an exported pure function reading `window.location.search` (set via `window.history.replaceState` in jsdom) and returning `URLSearchParams`; no real browser, network, or layout is involved. An existing test in the same file already exercised the single-value static-embed path, so this witness just extends it to the multi-value case.

### 5. Confidence
High. The mutation is a byte-faithful reproduction of the pre-fix expression at the exact site the fix commit touched, verified by the discriminating assertion (arrays vs. last-value-only). The observable is a plain JS value produced by a pure exported function, with the same `window.location.search` fallback path the static-embed download uses in production, so the jsdom witness reproduces the real defect without a browser.