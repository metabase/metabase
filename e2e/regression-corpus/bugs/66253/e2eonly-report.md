Done. The mutation and witness are both left in the worktree.

## 1. git diff (product mutation)

`frontend/src/metabase/AppThemeProvider.tsx` — semantic revert of fix commit `68fb668`. The fix logic had drifted from `ThemeProvider.tsx` into `AppThemeProvider.tsx`, into the pure helper `getColorSchemeFromDisplayTheme`. Removed the `case undefined:` branch (and added `export` on the function for the witness):

```diff
-const getColorSchemeFromDisplayTheme = (
+export const getColorSchemeFromDisplayTheme = (
   ...
   switch (displayTheme) {
     case "light":
     case "transparent":
-    case undefined:
       return "light";
```

With the branch removed, `getColorSchemeFromDisplayTheme(undefined)` returns `null` instead of `"light"`.

## 2. Witness

New spec `frontend/src/metabase/AppThemeProvider.unit.spec.tsx`:

```tsx
import { getColorSchemeFromDisplayTheme } from "./AppThemeProvider";

describe("getColorSchemeFromDisplayTheme", () => {
  it("should default to light when no theme is provided (metabase#66253)", () => {
    expect(getColorSchemeFromDisplayTheme(undefined)).toBe("light");
  });
  it("should resolve explicit light/dark themes", () => {
    expect(getColorSchemeFromDisplayTheme("light")).toBe("light");
    expect(getColorSchemeFromDisplayTheme("dark")).toBe("dark");
  });
});
```

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/AppThemeProvider.unit.spec.tsx`

- Clean HEAD (`case undefined` present): PASS (2/2).
- Mutant (`case undefined` removed): FAIL — `expect(received).toBe(expected)` / `Expected: "light" Received: null` at the `undefined` assertion. The other two cases still pass, confirming the discriminator is precisely the mutated branch.

## 3. Bug summary

In static/public embedding, when no `theme` hash parameter is supplied, `displayTheme` is `undefined`. The e2e repro (`embedding-dashboard.cy.spec.js`, `metabase#66253`) stubs `matchMedia` so the OS reports `prefers-color-scheme: dark`, then asserts the embed still renders light (`html[data-mantine-color-scheme="light"]`, `html[data-metabase-theme="light"]`). Without the `case undefined` branch, the helper returns `null`, so `forceColorScheme` is `null` and `AppColorSchemeProvider` falls back to the user/system color scheme — which resolves to dark under a dark OS preference. So a themeless static embed incorrectly defaults to dark/system instead of light.

## 4. Outcome

`witness_authored` — the bug is unit-catchable. The observable (light-vs-dark resolution for `undefined` theme) is fully determined by a pure function; the e2e's `matchMedia` stubbing and DOM-attribute assertions are just an indirect way of probing this same value. The jest witness is a faithful, faster unit replacement for the e2e.

## 5. Confidence

High. The mutation is the exact inverse of the fix commit's product change (the `case undefined: return "light"` line the fix added), applied at the drifted location of the same function. The witness asserts on the precise value the missing branch controls; it fails on the mutant and passes clean, with the sibling `"light"`/`"dark"` cases unaffected, confirming the discriminator isolates the mutation rather than any incidental behavior.