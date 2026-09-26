Reconstruction complete. Diff is left in place in the worktree.

## 1. git diff (semantic revert)

`frontend/src/metabase/common/components/AccordionList/AccordionList.tsx` (list container in `render()`):
```diff
         ref={this.listRootRef}
-        role="tree"
+        role="grid"
         onKeyDown={this.handleKeyDown}
```

The fix commit (b76a181, "Fix parameter target popover empty state") ripped `react-virtualized` out of `AccordionList` entirely. Under virtualization the list container was a `react-virtualized` `List` whose grid element carried `role="grid"` (via `containerRole={role}`, default `role = "grid"`); de-virtualized, it became a plain `Box` with `role="tree"`. The role is the exact observable DOM artifact of that change — and precisely what the shipped spec-diff switched on (`getAllByRole("grid")` → `getAllByRole("tree")`). Flipping the hardcoded `role="tree"` back to `"grid"` is the minimal semantic reintroduction of the pre-fix behavior.

## 2. Oracle

- Spec: `frontend/src/metabase/common/components/AccordionList/AccordionList.unit.spec.tsx`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/common/components/AccordionList/AccordionList.unit.spec.tsx`
- Baseline (clean HEAD): PASS — Tests: 15 passed, 15 total.
- Reconstructed (mutation applied): FAIL — Tests: 1 failed, 14 passed, 15 total.

## 3. failure_shape

- Failing test: `AccordionList › should correctly select items when searching`
- Assertion mismatch: `TestingLibraryElementError: Unable to find an accessible element with the role "tree"` at line 101, `const CONTAINER = screen.getAllByRole("tree")[0];`. Expected a container with role `tree` in the DOM; received a container with role `grid`. A clean DOM/role mismatch — not a compile or import error.

## 4. Confidence + adversarial

High confidence this isolates the reverted behavior. The surviving spec is the direct descendant of the fix's shipped spec (the fix's one-line spec-diff changed this very query from `grid` to `tree`; it now lives at line 101). Only the one test that queries the container by role trips — the mutation is surgical: 14 sibling tests stay green, including `getByRole("img", {name: /search/i})` (line 56) and `getByRole("button", {name: /Action/})` (line 147), plus all the search-filter/section-toggle/global-search tests that assert on text presence rather than the container role. So the failure is a targeted role regression, not a blunt render break.

## 5. Outcome

`kill`. The historical bug is caught by a surviving jest unit spec. Oracle relocation: none needed — the discriminating spec is co-located and was carried forward intact; only its internal role query moved from line 120 (shipped) to line 101 (current). No new unit test is required; the existing regression protection is live and effective.