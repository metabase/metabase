type SummaryWellId = "values" | "columns";

export function summarySidebar() {
  return cy.findByTestId("summary-sidebar");
}

/** Summarize by (`values`) or Group by (`columns`). */
export function summaryWell(wellId: SummaryWellId) {
  return cy.findByTestId(`summary-well-${wellId}`);
}

/** A chip in a well, by the text it shows or a part of it. */
export function summaryWellItem(wellId: SummaryWellId, name: string) {
  return summaryWell(wellId).contains(
    '[data-testid="summary-well-item"]',
    name,
  );
}

export function summaryFieldList() {
  return cy.findByTestId("summary-field-list");
}

/**
 * A field in the list. `section` scopes it to a table, for a name that several tables share,
 * like "Created At".
 */
export function summaryField(
  name: string,
  { section }: { section?: string } = {},
) {
  const list = section
    ? summaryFieldList().findByRole("region", { name: section })
    : summaryFieldList();
  return list.findByRole("button", { name });
}

/**
 * Clicks a field in the list. A column replaces the groupings and a metric or measure replaces
 * the values; with `add` it joins them instead.
 */
export function clickSummaryField(
  name: string,
  { section, add = false }: { section?: string; add?: boolean } = {},
) {
  summaryField(name, { section }).click({ altKey: add });
}

function pickSummaryOption(wellId: SummaryWellId, label: string, name: string) {
  summaryWell(wellId).findByLabelText(label).type(name);
  cy.contains('[role="option"]', name).click();
}

/**
 * Adds a value through the Summarize by typeahead: "Count of rows", a metric, a measure, or a
 * column, which is aggregated with its default operator (Sum for a number).
 */
export function addSummaryValue(name: string) {
  pickSummaryOption("values", "Add a value by name", name);
}

/** Adds a grouping through the Group by typeahead. */
export function addSummaryGrouping(name: string) {
  pickSummaryOption("columns", "Add a grouping by name", name);
}

/** Removes a chip from either well by its full label, e.g. "Sum of Total". */
export function removeSummaryItem(name: string) {
  summarySidebar().findByLabelText(`Remove ${name}`).click();
}

/** Opens the operator menu of a column value's chip, e.g. to switch "Sum of Total" to Average. */
export function openSummaryValueMenu(name: string) {
  summaryWell("values")
    .findByLabelText(`Change how ${name} is calculated`)
    .click();
}
