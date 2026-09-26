Hole closed. Here is my report.

## FE hole-closer — issue 49642

### 1. Test added
`frontend/src/metabase/parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget/SingleSelectListField/SingleSelectListField.unit.spec.tsx`

```tsx
it("reports the search term and clears the current selection when typing in the search box", async () => {
  const { onChange, onSearchChange } = setup();

  const input = screen.getByPlaceholderText("Find...");
  await userEvent.type(input, firstOption);

  expect(onSearchChange).toHaveBeenCalledWith(firstOption);
  expect(onChange).toHaveBeenLastCalledWith([]);
});
```

It reuses the file's existing `setup()` helper (which already wires `onChange`/`onSearchChange` as `jest.fn()`s but never asserted on them) and the `firstOption` constant. No new imports, no server/network mocking.

### 2. Level
Container-level RTL test on `SingleSelectListField`, covering behavior (b) — `handleFilterChange`. I chose (b) over (a) because it is the cleaner discriminator: `onSearchChange` and `onChange([])` fire synchronously inside `handleFilterChange`, so the assertions are direct `jest.fn` value checks with no waiting. Behavior (a) (the `isFilterInValues` early-return) depends on the debounced `filteredOptions` and only diverges after the 100ms debounce settles, which would have required a controlled parent wrapper and asserting continued DOM presence — inherently flakier.

### 3. Proof
- Clean HEAD: `Tests: 6 passed, 6 total` — new test PASSES.
- Semantic revert applied (reduced `handleFilterChange` to just `setFilter(value)`, dropping `onChange([])` / `setSelectedValue(null)` / `onSearchChange?.(value)`): `Tests: 1 failed, 5 passed, 6 total`. Failure is a clean value assertion:
  ```
  ● reports the search term and clears the current selection when typing in the search box
    expect(jest.fn()).toHaveBeenCalledWith(...expected)
    Expected: "AK"
    Number of calls: 0
  ```
- Product file then restored to HEAD; re-run → `Tests: 6 passed, 6 total`.

### 4. Isolation
The 5 sibling tests (`displays search input`, `displays options`, and three duplicate-option tests) stayed green under the revert. The single new test's failure is a value assertion (`toHaveBeenCalledWith`), not a compile/render error.

### 5. Outcome
`hole_closed`. `git diff --stat` shows only the spec file (+10 lines); the product file is at HEAD.