# 24629: Escape adds the highlighted recipient

## Where the code moved
The fix (2c106817a41) split Escape out of the enter/tab/comma commit branch in
`TokenField.onInputKeyDown`. TokenField no longer exists: #77768 (GDGT-2578 Replace
TokenField) moved `RecipientPicker` onto `metabase/ui` `MultiAutocomplete` with
`selectFirstOptionOnChange`. Enter handling now comes from Mantine's combobox
target (`clickSelectedOption` when an option is highlighted). The only Escape logic
in Metabase code is `handleWindowKeydownCapture` in
`frontend/src/metabase/ui/components/inputs/MultiAutocomplete/use-multi-autocomplete/use-multi-autocomplete.ts`.
It is a window capture listener that swallows Escape while the dropdown is open and
closes the dropdown. The reach-counts locations point to this function too.

## Mutant (one line)
`combobox.closeDropdown()` -> `combobox.clickSelectedOption()` in that handler.
Escape now does exactly what Enter does, submitting the highlighted option, and the
dropdown stays open because options remain. That matches the statement: Escape adds
the highlighted option instead of dismissing the suggestions. It is the same bug as
the pre-fix TokenField, where Escape shared the `addSelectedOption` branch and
stopped propagation.

## Oracle (new, RecipientPicker.unit.spec.tsx)
July's witness targets TokenField.unit.spec.tsx, which is gone, so it does not apply.
I wrote a new test next to the existing "type name + enter" test. It renders
RecipientPicker with recipients [Barb] and types "Na", so Nancy is the only match and
gets highlighted by selectFirstOptionOnChange. Then it presses Escape and asserts:
(1) onRecipientsChange never got [Barb, Nancy]; (2) no Nancy option remains visible.

Clean HEAD: ✓ should not add the highlighted user ... (metabase#24629); 7 passed.
Mutant: ✕ same test; `expect(jest.fn()).not.toHaveBeenCalledWith(...expected)`,
Number of calls: 3, call 3 = [Barb, Nancy]; 1 failed, 6 passed.

## Adversarial check
The failing assertion is on the recipients callback's argument. The mutant's third
call is exactly [Barb, Nancy], so Escape committed the highlighted user. This is not a
render crash: the other 6 tests in the file pass on the mutant, and the precondition
`findByRole("option", {name: /Nancy/})` passes before Escape. The MultiAutocomplete
spec also loads fine on the mutant (34/35 pass). Its one failure is the existing
"should close the dropdown on escape and open it back when typing" test. That test
also kills the mutant, but only through the not-dismissed half, because it sets no
highlight, so nothing gets added. The new witness is the one that sees the "adds" half.

## Variants (all in handleWindowKeydownCapture)
- v1: clickSelectedOption() then closeDropdown(). Adds and dismisses. KILL (same
  callback assertion).
- v2: stopImmediatePropagation dropped. Mantine's target handler still closes the
  dropdown and nothing is added, but Escape leaks to the outer popover or modal.
  SURVIVE.
- v3: `&& combobox.dropdownOpened` guard dropped. Escape is swallowed even when the
  dropdown is closed. SURVIVE (the dropdown is open in the test).
v2 and v3 are about the outer-popover fix (#56562), not this bug. The witness would
need a wrapping Popover or modal to see them.
## Gotchas
- `screen.queryByText("Nancy")` still finds the option after Escape on clean HEAD,
  because the dropdown stays mounted but hidden. Use role queries, which skip hidden
  nodes (my first draft failed on clean for this reason).
- Users in RecipientPicker fail parseValue (non-email), so typing "Na" never changes
  the value list. The only way Nancy reaches the callback is an option submit.
  No .cljc touched; no cljs rebuild.
