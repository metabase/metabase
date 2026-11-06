type SummaryWellId = "values" | "columns";

export function summarySidebar() {
  return cy.findByTestId("summary-sidebar");
}

/** Summarize by (`values`) or Group by (`columns`). */
export function summaryWell(wellId: SummaryWellId) {
  return cy.findByTestId(`summary-well-${wellId}`);
}

export function summaryWellItem(wellId: SummaryWellId, name: string) {
  return summaryWell(wellId).contains(
    '[data-testid="summary-well-item"]',
    name,
  );
}

export function summaryFieldList() {
  return cy.findByTestId("summary-field-list");
}

/** `section` scopes the lookup to a table, for a name that several tables share, like "Created At". */
export function summaryField(
  name: string,
  { section }: { section?: string } = {},
) {
  const list = section
    ? summaryFieldList().findByRole("region", { name: section })
    : summaryFieldList();
  return list.findByRole("button", { name });
}

/** A click replaces what the field's well holds; with `add` it joins it instead. */
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

export function addSummaryValue(name: string) {
  pickSummaryOption("values", "Add a value by name", name);
}

export function addSummaryGrouping(name: string) {
  pickSummaryOption("columns", "Add a grouping by name", name);
}

export function removeSummaryItem(name: string) {
  summarySidebar().findByLabelText(`Remove ${name}`).click();
}

export function openSummaryValueMenu(name: string) {
  summaryWell("values")
    .findByLabelText(`Change how ${name} is calculated`)
    .click();
}
