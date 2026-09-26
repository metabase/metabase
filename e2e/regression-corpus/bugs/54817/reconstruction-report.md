Confirmed. This is a `dead_target`. Here is the report.

## FE semantic-reconstruction report — issue 54817

### 1. git diff
`none` — no semantic revert was applied. The target product code no longer exists at HEAD, so there is nothing to revert. The worktree is left clean (only the harness `target`/`node_modules` symlinks added).

### 2. Oracle
No oracle exists. The fix's shipped jest spec was `frontend/src/metabase/querying/filters/components/FilterModal/FilterModal.unit.spec.tsx` (added test: `"should allow to focus the search input via keyboard"`). That file — and the entire `FilterModal/` directory — was **deleted** at commit `fbe7015a1b7` / `3ca34fbcf65` ("Multi-stage filter picker in chill mode", #55052). `git log --follow` confirms a pure deletion with no rename destination. There is no surviving descendant spec and no baseline to run.

### 3. failure_shape
N/A — no discriminating test exists to flip.

### 4. Confidence + adversarial
High confidence this is a dead target:
- The fix (`da5e954e630`) touched two product files — `FilterModal/FilterModal.tsx` (added `<FocusTrap.InitialFocus />` in the modal header) and `FilterModal/FilterSearchInput/FilterSearchInput.tsx` (removed `aria-hidden` from the dedicated column-search input). Both files are gone at HEAD (`git ls-files "*FilterModal*"` / `"*FilterSearchInput*"` return nothing; the directory does not exist).
- Repo-wide, the buggy structure has no survivor: `grep "Search for a column…"` and `FilterSearchInput` return zero hits under `querying/filters`; no `FocusTrap.InitialFocus` and no keyboard-focus/search jest test remains in the filters tree. The `userEvent.tab()` occurrences in surviving filter specs (`FilterPicker.unit.spec.tsx`, etc.) blur the custom-expression editor — unrelated to the deleted column-search-input focus behavior.
- The full-screen `FilterModal` (header search input + tabs + `FocusTrap`) was replaced by a popover-based `FilterPicker/MultiStageFilterPicker` → `FilterColumnPicker`, which delegates column search to `AccordionList`'s built-in searchable field. That is a different implementation with no `aria-hidden`/`InitialFocus` sentinel to reintroduce, so the historical bug cannot be expressed in current code.

### 5. Outcome
`reconstruction_failed`, category **dead_target**. Both the product code (`FilterModal.tsx`, `FilterSearchInput.tsx`) and the shipped jest spec (`FilterModal.unit.spec.tsx`) were deleted by refactor #55052 with no relocated descendant and no semantically equivalent code path to revert. Not closable with a new unit test against current HEAD — the component the bug lived in no longer exists; the initial-focus concern would have to be re-derived for the new `AccordionList`-based `FilterColumnPicker`, which is a different behavior, not this regression.