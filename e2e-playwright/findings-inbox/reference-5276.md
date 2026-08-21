# reference-5276 (onboarding/reference/reproductions/5276-remove-field-type)

Ported 1 test faithfully. Verified on the jar (COMMIT-ID 751c2a98), slot 1:
1/1 green, 2/2 under `--repeat-each=2`. tsc clean. No new helper file needed —
covered by existing shared helpers. No product bug, no fixme.

## Fixes made while stabilizing (both known gotchas, not new)

1. **Mantine Select option accessible name includes its leading icon.** The
   SemanticTypePicker (`metabase/metadata/components/SemanticTypePicker`) is a
   grouped, `searchable` Mantine `<Select>`. Its dropdown options render an icon
   before the label, so the option's accessible name is `"empty icon No semantic
   type"`, not `"No semantic type"`. Porting `H.popover().findByText("No semantic
   type")` as `getByRole("option", { name, exact: true })` timed out — the exact
   match never hit. Fix: match the option name as a substring (drop `exact`).
   This is a corollary of the existing wave-10 rule ("Mantine Select option rows
   can't be clicked even with force — open the select, then pick the
   role='option'"): the role='option' is right, but its name carries the icon.
   Worth a one-line note in that gotcha if it recurs.

2. **`cy.button(/Edit/).trigger("click")` → `dispatchEvent("click")`.** The
   reference "Edit" button is special-cased upstream (the spec's own comment: a
   real `.click()` enters edit mode and then immediately `resetForm`s back out).
   `.trigger("click")` fires only the synthetic React onClick; the faithful
   Playwright equivalent is `dispatchEvent("click")` (rule already covered under
   react-flow node clicks / synthetic dispatch).

## Helper reuse (dividend)

`cy.findByDisplayValue("Score").click()` and `.should("not.exist")` mapped 1:1
onto the existing shared `getControlByDisplayValue` / `expectNoDisplayValue`
(`support/viz-tabular-repros.ts`) and `popover` (`support/ui.ts`). The retried
input/textarea/select scan handles the Mantine Select input (whose value is the
option *label*, "Score") without any spec-local code.

## Cross-check

Not needed — no bug/fixme claim was made; the port went green on the jar on the
first real interaction, and the only failures were selector-shape mistakes in
the port itself (fixed above), not app behaviour.
