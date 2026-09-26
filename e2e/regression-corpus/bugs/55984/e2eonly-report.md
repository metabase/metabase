Confirmed. Here is my report.

## Report: issue 55984 — "overflow in expression editor suggestions"

### 1. git diff (product mutation) — semantic revert

Reintroduced the bug in the current file (it drifted from `query_builder/...` to `querying/...`):

`frontend/src/metabase/querying/components/expressions/Editor/Listbox/Listbox.module.css`

```css
  .icon {
    margin-right: 8px;
    height: 14px;
    width: 14px;
-   flex-shrink: 0;          /* removed */
  }
}

.label {
- white-space: pre-wrap;     /* reverted to: */
- overflow: hidden;
- text-overflow: ellipsis;
- overflow-wrap: break-word;
+ white-space: pre;
}
```

This is a faithful, exact semantic revert of the fix commit's product change (the only other file the commit touched, `SearchBar.styled.tsx`, was a stray blank-line edit unrelated to the bug). The mutation is left applied in the worktree.

### 2. Witness — none (irreducible layout/geometry)

No jest witness is possible. The fix consists solely of CSS declarations in a `*.module.css` file. The e2e oracle is `H.isScrollableHorizontally($el[0])`, defined in `e2e/support/helpers/e2e-ui-elements-overflow-helpers.js`, which computes `offsetHeight - clientHeight - borderWidth > 0` — i.e. it detects whether the browser rendered a horizontal scrollbar because a long, unwrapped suggestion name (`white-space: pre`) overflowed the listbox.

jsdom implements no CSS layout engine:
- `offsetHeight`/`clientHeight`/`scrollWidth`/`clientWidth` are hardcoded to `0`, so `isScrollableHorizontally` always returns `false` regardless of the CSS — it cannot discriminate clean vs. mutant.
- jsdom does not apply CSS-module stylesheet rules, `white-space` wrapping, `text-overflow`, or `flex-shrink` geometry; `getComputedStyle` returns only inline styles.

There is no JS seam: the component (`Listbox.tsx`) applies `S.label`/`S.icon` as static `className`s (lines 122, 130, 133, 135); no TypeScript reads or branches on these style values, so there is no exported function or DOM assertion a unit test could pin. The bug manifests only through real browser layout.

### 3. Bug summary

With `white-space: pre` and no `overflow-wrap`/`flex-shrink`, a very long suggestion name (e.g. "Lorem ipsum dolor sit amet…", with or without spaces) in the custom-expression autocomplete listbox does not wrap or ellipsify; it forces the completions container wider than its viewport, producing a horizontal scrollbar / overflow. The fix makes the label wrap and ellipsify and stops the icon from shrinking.

### 4. Outcome: `no_witness` — irreducible class: layout/geometry

### 5. Confidence

High. The mutation is byte-for-byte the inverse of the fix commit's CSS, at the same (drifted) location, so it reintroduces exactly the observable the e2e checks. It is irreducible because the sole observable is browser-computed overflow geometry (scrollbar presence from `offset/clientHeight`), which jsdom does not model, and the change touches no JavaScript logic that a unit test could observe.