The task is complete. Both the product mutation and the witness are left in the worktree, verified in both directions.

## Report

### 1. git diff (product mutation)

The fix commit's mechanism (`shouldRenderAsNightMode = isNightMode && (isFullscreen || isEmbeddingIframe)` in `dashboard/context/context.tsx`) was **entirely removed** by the later "Dark mode" refactor (#64016, commit `952aeefd585`). Night-mode-as-a-boolean-class no longer exists; the embed theme is now resolved to a Mantine color scheme and applied via CSS. So a blind `git apply -R` is impossible — I reintroduced the *behavior* at its modern seam.

`frontend/src/metabase/AppThemeProvider.tsx`:
```diff
-const getColorSchemeFromDisplayTheme = (
+export const getColorSchemeFromDisplayTheme = (   // test-enabler, non-behavioral
   displayTheme: ...
 ): ResolvedColorScheme | null => {
   switch (displayTheme) {
     case "light":
     case "transparent":
     case undefined:
       return "light";
-    case "night":            // ← MUTATION: night no longer maps to the dark color scheme
     case "dark":
       return "dark";
   }
   return null;
 };
```

For static/public embedding, `useColorSchemeFromHash` reads the iframe hash (`#theme=night`) through this function. Dropping the `"night"` case makes it fall through to `null` → the app falls back to the light color scheme → `theme.other.colorScheme` is not `"dark"` → `getCellBackgroundColor` in `PivotTable.styled.tsx` takes the light branch (`color(backgroundColor ?? "background_page-primary")` = white) instead of the dark branch (`alpha("background_page-primary-inverse", 0.1)` = the transparent `rgba(46,53,59,0.1)` the e2e asserts). This is the modern equivalent of "night rendering not applied in the embed."

### 2. Witness

`frontend/src/metabase/AppThemeProvider.unit.spec.tsx` (new, added). Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/AppThemeProvider.unit.spec.tsx`

Key assertion: `expect(getColorSchemeFromDisplayTheme("night")).toBe("dark")`

- PASS on clean (case present): 2/2 pass.
- FAIL on mutant (case removed): `Expected: "dark" / Received: null` — a clean value assertion, not a compile error.

### 3. Bug summary
In static (and public) embedding, selecting the Dark/"night" appearance no longer applies dark rendering to dashboard content. Pivot-table cells render with white backgrounds (and dark text on white) instead of the dark/transparent cells, dark dashcard background, and white text the e2e (`metabase#61741`) checks. The `data-embed-theme="night"` attribute is still set on the frame, but the color scheme driving actual colors resolves to light.

### 4. Outcome
**witness_authored** — the bug is unit-catchable. The observable reduces to a pure theme-resolution function (`getColorSchemeFromDisplayTheme`) that is deterministic and jsdom-independent, so the e2e is replaceable at the unit level. (The e2e's final `rgba(...)` color assertion depends on real CSS-variable/computed-style resolution, but the load-bearing discriminator — "night ⇒ dark color scheme" — is a pure value the witness pins directly.)

### 5. Confidence
High that the mutation faithfully reintroduces the bug: I traced the full current chain — static-embedding hash `#theme=night` → `useColorSchemeFromHash`/`getColorSchemeOverride` → `getColorSchemeFromDisplayTheme("night")` → `forceColorScheme` → `AppColorSchemeProvider` → `theme.other.colorScheme` → `getCellBackgroundColor`'s `isDarkMode` branch (`PivotTable.styled.tsx:51-73`), whose light branch is exactly the white cell the original bug produced. The mutation is scoped: `"dark"` (settings-driven app dark mode) still resolves correctly, so only the embed `"night"` path regresses — mirroring the original fix's embedding-only scope. Note the mutation is broader in symptom than "just pivot cells" (all embed night content goes light), which is consistent with the e2e's own multi-property checks (dashcard bg, cell bg, text color).

The `export` keyword added to the function is a non-behavioral test-enabler, not part of the semantic revert.