# dashboard-filters-remapping

Source: `dashboard-filters/dashboard-filters-remapping.cy.spec.ts`
Target: `tests/dashboard-filters-remapping.spec.ts`
New helper: `support/dashboard-filters-remapping.ts` (findWidget, clearWidget,
testDefaultValuesRemapping, testWidgetsRemapping)

1 test. Green on the jar first try (slot 3, 8.0s); 2/2 under `--repeat-each=2`.
tsc clean for these files. No `test.fixme`, no product-bug claims. The
near-twin `native-filters-remapping.spec.ts` port modelled most of it.

## Fixes / classifications

- **Widget lookup must be exact aria-label, not text (known gotcha, applied).**
  The spec's `findWidget` is `dashboardParametersContainer().findByLabelText(name)`.
  Two independent reasons the text-based `filterWidget`/`filterWidgetByName`
  helpers are wrong here, so `findWidget` uses `getByLabel(name, { exact: true })`:
  1. Every widget carries a remapped **default value**, so the visible text is
     the value ("Small Marble Shoes"), never the parameter name — a hasText-name
     match finds nothing.
  2. The names collide as substrings ("FK" ⊂ "FK->Name" ⊂ "PK+FK->Name"), so a
     substring match is a strict-mode multi-match.
  The stable handle is the trigger's `aria-label`, which the FE sets to
  `parameter.name` (ParameterValueWidgetTrigger `ariaLabel`, ParameterValueWidget:214).
  This is the "filterWidget over getByLabel" default correctly *not* applying —
  documented in the helper's header.

- **ID token fields need pressSequentially (rule 5, applied).** Cypress typed
  `"1,"` into "Enter an ID"; the trailing comma commits the token and only real
  keystrokes fire it. Same as the native-filters-remapping port.

- **Two models must be created before the questions (known: create* helpers are
  not thin wrappers).** The dashboard's Orders/People questions source
  `card__<modelId>`, so the two models are created with `createQuestion` first,
  then the three dashcards (orders question / people question / native question)
  go through `createDashboardWithQuestions` in order → getDashboardCard(0/1/2).

## Dividends

None. No Cypress-masked bug surfaced; behaviour matches the jar. Public +
signed-embedded remapping both verified (same testid container across all three
contexts, as upstream assumes).
