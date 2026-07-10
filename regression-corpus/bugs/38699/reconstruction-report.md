The reconstruction succeeded. The diff is left in the worktree. Final report below.

---

## 1. git diff (semantic revert)

```diff
diff --git a/enterprise/frontend/src/metabase-enterprise/whitelabel/components/FontWidget/FontWidget.tsx
@@ -30,7 +30,7 @@ export const FontWidget = () => {
     await updateSetting({
       key: "application-font",
-      value: newValue === "custom" ? defaultFont : newValue,
+      value: newValue,
     });
```

The fix commit (`8281abdce1`, PR #38713, epic `metabase#38699`) introduced a `CUSTOM`/`"custom"` sentinel for the font Select so the sentinel is never written as the actual font value — when "Custom…" is picked, `application-font` must be set to the real default font, not the sentinel. My revert removes the sentinel→default mapping so the sentinel string `"custom"` leaks into `application-font`, exactly the bug the fix prevents.

## 2. Oracle

- **Spec:** `enterprise/frontend/src/metabase-enterprise/whitelabel/components/FontWidget/FontWidget.unit.spec.tsx`
- **Command:** `bun run test-unit-keep-cljs enterprise/frontend/src/metabase-enterprise/whitelabel/components/FontWidget/FontWidget.unit.spec.tsx` (run from worktree root with `target`/`node_modules` symlinked from the main tree)
- **Baseline (clean HEAD):** Tests: 10 passed, 10 total
- **Reconstructed (mutation applied):** Tests: 1 failed, 9 passed, 10 total

**Oracle relocation:** The shipped spec was heavily refactored, not just relocated. The original component used a controlled `onChange(event)` with `null` sentinel and a core `Select`; it now uses `useAdminSetting` hooks + a `"custom"` string sentinel + `BasicAdminSettingInput`, and the spec asserts PUT request bodies rather than `onChange` callback args. The behavioral contract (custom selection must not leak the sentinel as the font value) is preserved and discriminated.

## 3. failure_shape

- **Failing test:** `FontWidget › should set a custom font from a built-in font`
- **Assertion mismatch:** `expect(body).toEqual({ value: "Lato" })` — Expected `{ "value": "Lato" }`, Received `{ "value": "custom" }`. A clean value mismatch, not a compile/import error.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. Only the one test that selects "Custom…" from a built-in font trips, because that is the sole path where `newValue === "custom"` and the mapping matters. Siblings stay green and prove the break is surgical:
- "should set a built-in font from a built-in font" (Lato→Lora) — passes; `newValue` is a real font name, unaffected.
- "should set a built-in font from a custom font" (Custom→Comic Sans) — passes; selecting away from custom writes the real font.
- The env-var test and all six font-files management tests — passes; untouched code paths.

The `application-font-files` PUT (`value: []` for custom) is a separate `updateSetting` call I did not touch, so it remains correct — the failure is precisely the `application-font` value, nothing blunter.

## 5. Outcome

**kill** (oracle relocated/refactored: `metabase-lib`-era controlled component → `useAdminSetting` hook component; callback-arg assertions → request-body assertions; same behavioral contract).

Note on the other behavioral strand in this PR — the "disconnect application colors from chart colors" change (`getPreferredColor("count")`: `brand`→`accent0` in `colors/groups.ts`, now at `frontend/src/metabase/ui/colors/groups.ts`) — is a **dead_target**: its shipped discriminating spec `static-viz/.../series.unit.spec.ts` and the tested function `getSeriesWithColors` were both deleted by the later ECharts static-viz rewrite. Surviving specs (`ui/colors/charts.unit.spec.ts`, `lib/settings/series.unit.spec.ts`) don't discriminate the count→accent0 change: they either pre-map `count` to `accent1` or use the default palette where `brand === accent0 === #509EE3`. The FontWidget strand carries the kill, so the overall target is closable and already closed by the surviving jest oracle — no new test needed.