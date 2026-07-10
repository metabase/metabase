Confirmed. The mutation is in place and I've established the witness feasibility with certainty. Here is my report.

---

## 1. git diff (product mutation)

The semantic revert removes the one CSS property the fix added. The file moved since the fix commit (from `NativeQueryEditor/CodeMirrorEditor/CodeMirrorEditor.module.css` to `common/components/CodeMirror/CodeMirror.module.css`), but the logic is identical.

```diff
 ul:has(.cm-completionLabel) {
   display: grid;
   gap: 0 1rem;
   grid-template-columns: 1fr;
-  grid-auto-rows: max-content;

   &:has(.cm-completionDetail) {
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ad57bf8e5f907af55/frontend/src/metabase/common/components/CodeMirror/CodeMirror.module.css` (line 148 deleted). Left applied in the worktree.

## 2. Witness

**None — no unit seam exists.** See outcome/confidence below.

## 3. Bug summary

The native-query autocomplete popup lays its options out in a CSS grid inside a fixed-max-height, scrollable container. Without `grid-auto-rows: max-content`, implicit grid rows default to `auto`, so when there are many completions the browser distributes/compresses the rows to fit the container instead of giving each row its natural content height. Result: rows shrink, the inner completion label (e.g. "SAVEPOINT") gets vertically clipped, and the list stops overflowing/scrolling properly. `max-content` pins each row to its content height, so the container overflows and scrolls, and inner text is not cut off.

The shipped e2e (`native-reproductions.cy.spec.ts`, issue 63711) asserts exactly two geometric facts: the completions list's `scrollHeight > clientHeight` (it actually overflows/scrolls), and each option's inner element `offsetHeight === outer clientHeight` (text not clipped).

## 4. Outcome

**`no_witness` — irreducibly e2e, class: layout/geometry.**

The entire fix is a single CSS grid property. There is no JS/TS logic, no exported function, no DOM-structure change, and no computed value in Metabase code to assert on — the option list is rendered by CodeMirror's autocomplete extension; Metabase contributes only stylesheet rules. The bug's observable is box geometry (`clientHeight`, `scrollHeight`, `offsetHeight`).

Two independent facts make it impossible to discriminate the mutation at the jest/unit level:
- **jsdom does no layout.** `clientHeight`/`scrollHeight`/`offsetHeight`/`getBoundingClientRect()` all return 0 regardless of styles — there is no box model or CSS-grid engine.
- **CSS is fully stripped in jest anyway.** `jest.config.js` line 46 maps `\.(css|less)$` to `frontend/test/__mocks__/styleMock.js`, which exports `{}`. Class names resolve to `undefined` and no rule (present or absent) is ever applied.

So both the mutated and clean code produce byte-identical jest DOM output (all measurements 0). The only honest "witness" would be grepping the CSS source for the `grid-auto-rows` string, which tests the fix's literal text, not observable behavior — not a legitimate witness. No value/DOM assertion can tell mutant from clean.

## 5. Confidence

**High** that the mutation faithfully reintroduces the bug: it is a line-exact semantic revert of the fix commit's sole product change (`grid-auto-rows: max-content`), applied at the same grid rule that the original fix targeted, just at its new file location.

**High** that no unit seam exists: the fix touches only a CSS grid sizing property; the discriminating signal is real-browser box geometry, which jest's jsdom cannot compute and whose CSS input jest discards entirely. This is a textbook layout/geometry case where the Cypress e2e is genuinely load-bearing.