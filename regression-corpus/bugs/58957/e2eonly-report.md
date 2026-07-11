Done. Outcome: **witness_authored**.

## 1. git diff (product mutation)
Semantic revert of fix `106a53e50c` in `frontend/src/metabase/redux/downloads.ts`, function `convertSearchParamsToObject` (drifted from line 236 in the fix commit to line 362 today, but the logic is identical). The mutation restores the pre-fix behavior: every URL search param is wrapped in an array, so a single-occurrence param becomes `[value]` instead of the scalar `value`.

```diff
-  const object: Record<string, string | string[]> = {};
+  const object: Record<string, string[]> = {};
   for (const [key, value] of params.entries()) {
     if (object[key]) {
-      object[key] = ([] as string[]).concat(object[key], value);
+      object[key] = [...object[key], value];
     } else {
-      object[key] = value;
+      object[key] = [value];
     }
   }
```

## 2. Witness
Added to the existing `frontend/src/metabase/redux/downloads.unit.spec.ts` (block `getDatasetParams - embed question (token-based)`), exercising the exported `getDatasetParams` seam with `token` set (→ static-embed question) and a single date param in `window.location.search`:

```ts
it("encodes a single-occurrence filter value as a scalar, not an array (metabase#58957)", async () => {
  await mockIsEmbeddingSdk(false);
  setLocationSearch("?created_at=2025-02-11");

  const downloadParams = getDatasetParams({
    type: "csv", question, result, token: TOKEN, params: {},
  });

  const url = new URLSearchParams(downloadParams.params);
  expect(JSON.parse(url.get("parameters") ?? "")).toEqual({
    created_at: "2025-02-11",
  });
});
```

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/redux/downloads.unit.spec.ts -t "metabase#58957"`
- PASS on clean HEAD: 1 passed.
- FAIL on mutant: `Expected {created_at: "2025-02-11"}` / `Received {created_at: ["2025-02-11"]}` — a clean value assertion, not a compile error.

## 3. Bug summary
The e2e repro downloads a static-embedded native SQL question whose filter expects exactly one value (a `date/single` parameter). The download request serializes the active filter from the iframe URL into the `parameters` payload. Under the bug, `created_at=2025-02-11` is encoded as `{"created_at":["2025-02-11"]}`. The embed CSV endpoint rejects an array where a single-value date parameter is expected, so the download fails (returns wrong/empty result). The fix stores single occurrences as a scalar string and only builds an array when a key genuinely repeats, so multi-value field filters still work.

## 4. Outcome
`witness_authored` — the bug is fully unit-catchable. The observable (array vs. scalar in the serialized `parameters` object) is produced by a pure param-serialization path reachable from the exported `getDatasetParams`, with `window.location.search` mockable via `history.replaceState`. No browser layout/geometry, routing, or real network is involved; jsdom is sufficient. The e2e is replaceable at the unit level for this behavior.

## 5. Confidence
High. The mutation is a line-for-line restoration of the exact code the fix commit replaced, at the same function, so it faithfully reintroduces the reported behavior. The witness discriminates precisely on the changed dimension (single-occurrence → scalar vs. array), passes clean and fails on the mutant with a clean assertion diff, and reuses the file's established `setLocationSearch` / `mockIsEmbeddingSdk(false)` static-embed harness. Final worktree state: product mutation left applied in `downloads.ts`; witness left applied in `downloads.unit.spec.ts`.