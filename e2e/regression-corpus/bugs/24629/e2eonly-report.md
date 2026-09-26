Both changes are in the worktree: the product mutation (bug reintroduced) and the witness test.

## Report

### 1. git diff (product mutation)

Semantic revert in `frontend/src/metabase/common/components/TokenField/TokenField.tsx` (`onInputKeyDown`). The fix commit split Escape out into its own branch (preventDefault + blur, no commit); the mutation folds Escape back into the enter/tab/comma branch so Escape once again calls `addSelectedOption`:

```tsx
if (
  // enter, tab, comma
  keyCode === KEYCODE_ESCAPE ||
  keyCode === KEYCODE_TAB ||
  key === KEY_COMMA ||
  keyCode === KEYCODE_ENTER ||
  key === KEY_ENTER
) {
  if (this.addSelectedOption(event)) { ... }
}
```

Note: the file moved from `metabase/components/TokenField` (in the fix commit) to `metabase/common/components/TokenField` (current), so this is a behavior-level revert, not a blind `git apply -R`.

### 2. Witness

Added to `frontend/src/metabase/common/components/TokenField/TokenField.unit.spec.tsx` (reusing the existing `TokenFieldWithStateAndDefaults` harness and `inputKeydown` helper):

```tsx
it("should not add a recipient when Escape is pressed (metabase#24629)", () => {
  render(
    <TokenFieldWithStateAndDefaults multi value={[]} options={["foo", "bar"]} />,
  );
  type("ba");
  // typing auto-selects the first (only) matching option
  assertWithinOptions(["bar"]);

  // pressing Escape should dismiss the popover WITHOUT committing "bar"
  inputKeydown(KEYCODE_ESCAPE);
  expect(values()).not.toHaveTextContent("bar");
});
```

Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/common/components/TokenField/TokenField.unit.spec.tsx -t "Escape"`
- PASS on clean HEAD (1 passed).
- FAIL on mutant: `expect(element).not.toHaveTextContent()` — received `bar` (the option got committed as a value on Escape).

### 3. Bug summary
When a user types into a recipient/token input (e.g. the dashboard subscription "Email it" recipient field), the first matching option is auto-selected internally. Pressing Escape — expected to just dismiss the suggestion popover — instead runs the same code path as Enter/Tab/comma, committing the highlighted option as a recipient. The e2e repro types a partial admin name, presses `{esc}`, and asserts the input value is unchanged and no recipient was added.

### 4. Outcome
`witness_authored` — the bug is unit-catchable. The observable (Escape commits the auto-selected option via `onChange` → value list gains a token) is a pure React state/DOM effect reproducible in jsdom with fireEvent; no real browser, layout, routing, or network is involved. The e2e is therefore replaceable by this unit test.

### 5. Confidence
High. The mutation reintroduces exactly the pre-fix control flow (Escape sharing the `addSelectedOption` branch), which is the precise line the fix commit changed. The witness discriminates cleanly (clean: no `bar` token; mutant: `bar` token committed) with a genuine assertion failure, not a compile error, and mirrors the e2e's semantic check ("Escape must not add a recipient").