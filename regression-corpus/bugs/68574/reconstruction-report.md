# Reconstruction report — metabase#68574 (FE)

_Verbatim final report from the worktree-isolated FE reconstruction agent (ad58dab8d283e27da)._

---

Reconstruction succeeded. Report below.

## 1. `git diff`

```diff
diff --git a/frontend/src/metabase/querying/common/utils/dates.ts b/frontend/src/metabase/querying/common/utils/dates.ts
@@ -113,10 +113,7 @@ function abbreviateFormat(
   format: string,
   formattingSettings: DateFormattingSettings = {},
 ) {
-  if (!formattingSettings.date_abbreviate) {
-    return format;
-  }
-  return format.replace(/MMMM/, "MMM").replace(/dddd/, "ddd");
+  return format;
 }
```

Note the moved target: the fix commit patched `frontend/src/metabase/querying/filters/utils/dates.ts`, but the implementation has since been relocated to `frontend/src/metabase/querying/common/utils/dates.ts` (the old path now just re-exports from it). The fix logic (`formatDate` / `formattingSettingsToFormatString` / `abbreviateFormat` / `formatMonth`) is fully intact at the new location, and the oracle spec still reaches it through the re-export — so this is a relocation, not a deletion. Reconstruction proceeded normally.

## 2. Oracle spec + baseline vs reconstructed

Discriminating oracle: `frontend/src/metabase/querying/filters/utils/dates.unit.spec.ts` (`getDateFilterDisplayName`).

- Baseline: `Tests: 21 skipped, 24 passed, 45 total`
- Reconstructed: `Tests: 2 failed, 21 skipped, 22 passed, 45 total`

Failing assertions are the two fix-added `date_abbreviate: true` cases:
- `date_style: "dddd MMMM D, YYYY", date_abbreviate: true` → Expected `"Tue Mar 5, 2024"`, Received `"Tuesday March 5, 2024"`
- same with `hasTime: true` → Expected `"Tue Mar 5, 2024 12:00 AM"`, Received `"Tuesday March 5, 2024 12:00 AM"`

## 3. failure_shape

Genuine `toEqual` assertion mismatch (unabbreviated month/weekday names where abbreviated were expected). Not a compile/type/import error — spec compiles and runs; only the two abbreviation assertions fail.

## 4. Confidence + adversarial reasoning

High confidence. Adversarial checks:
- Not neutralizing: returning `format` unchanged is the exact pre-fix behavior — before this fix there was no abbreviation step at all, so `date_abbreviate` was silently ignored. The change reintroduces that real bug rather than trivially breaking the test.
- Discriminating: only the `date_abbreviate: true` cases fail; the sibling non-abbreviate case (`"Tuesday March 5, 2024"`) still passes, confirming the failure is specifically the abbreviation semantics the fix added, not collateral breakage.
- Minimal: single-branch edit inside `abbreviateFormat`; the `date_style`/`time_style` defaulting and missing-settings defensiveness are untouched, so unrelated tests stay green.

## 5. Ambiguity

Minor: the fix bundled two concerns (abbreviation + defensiveness for missing settings). I targeted the abbreviation half because it is what the chosen discriminating oracle (`dates.unit.spec.ts`) asserts. The other oracle (`formatting.unit.spec.ts`) also covers "unset settings" cases; a defensiveness-focused revert would exercise those instead. The abbreviation revert is the cleaner, more discriminating reproduction.
