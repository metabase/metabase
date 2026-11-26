import { moveDnDKitElementByAlias } from "./e2e-ui-elements-helpers";

type SummaryWellId = "values" | "columns" | "rows";

export function summarySidebar() {
  return cy.findByTestId("summary-sidebar");
}

/** Summarize by (`values`), Group by (`columns`), or the Rows well of the pivot mode (`rows`). */
export function summaryWell(wellId: SummaryWellId) {
  return cy.findByTestId(`summary-well-${wellId}`);
}

export function summaryWellItem(wellId: SummaryWellId, name: string) {
  return summaryWell(wellId).contains(
    '[data-testid="summary-well-item"]',
    name,
  );
}

/** Checks the chips a well holds, in order. */
export function assertSummaryWellItems(wellId: SummaryWellId, names: string[]) {
  summaryWell(wellId).should(($well) => {
    const chips = $well.find('[data-testid="summary-well-item"]').toArray();
    expect(chips.map((chip) => chip.textContent)).to.deep.equal(names);
  });
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

function dragToWell(alias: string, wellId: SummaryWellId) {
  summaryWell(wellId).then(([well]) => {
    cy.get(alias).then(([dragged]) => {
      const wellRect = well.getBoundingClientRect();
      const draggedRect = dragged.getBoundingClientRect();
      moveDnDKitElementByAlias(alias, {
        horizontal: wellRect.left + wellRect.width / 2 - draggedRect.left,
        vertical: wellRect.top + wellRect.height / 2 - draggedRect.top,
        useMouseEvents: true,
      });
    });
  });
}

/** Drags a field from the list with the mouse and drops it in the middle of a well. */
export function dragSummaryFieldToWell(
  name: string,
  wellId: SummaryWellId,
  { section }: { section?: string } = {},
) {
  summaryField(name, { section }).as("draggedSummaryField");
  dragToWell("@draggedSummaryField", wellId);
}

/** Drags a chip with the mouse from its well and drops it in the middle of another one. */
export function dragSummaryItemToWell(
  wellId: SummaryWellId,
  name: string,
  targetWellId: SummaryWellId,
) {
  summaryWellItem(wellId, name).as("draggedSummaryItem");
  dragToWell("@draggedSummaryItem", targetWellId);
}

const INPUT_LABELS: Record<SummaryWellId, string> = {
  values: "Add a value by name",
  columns: "Add a grouping by name",
  rows: "Add a row by name",
};

/** A closed typeahead keeps its options in the page, so the option is looked for among the visible ones. */
function pickSummaryOption(wellId: SummaryWellId, text: string, name = text) {
  summaryWell(wellId).findByLabelText(INPUT_LABELS[wellId]).type(text);
  cy.contains('[role="option"]:visible', name).click();
}

export function addSummaryValue(name: string) {
  pickSummaryOption("values", name);
}

export function addSummaryGrouping(name: string) {
  pickSummaryOption("columns", name);
}

export function addSummaryRow(name: string) {
  pickSummaryOption("rows", name);
}

/** Types a prompt in a well and picks the option that writes a formula for it with AI. */
export function generateSummaryFormula(wellId: SummaryWellId, prompt: string) {
  pickSummaryOption(wellId, prompt, `Generate “${prompt}”`);
}

export function removeSummaryItem(name: string) {
  summarySidebar().findByLabelText(`Remove ${name}`).click();
}

export function openSummaryValueMenu(name: string) {
  summaryWell("values")
    .findByLabelText(`Change how ${name} is calculated`)
    .click();
}

/** `name` is the grouping chip's label, like "Created At: Month". */
export function openSummaryGroupingMenu(name: string) {
  summaryWell("columns")
    .findByLabelText(`Change how ${name} is grouped`)
    .click();
}

/** Picks a date unit or binning the menu shows up front; the rest sit behind "More…". */
export function changeSummaryGroupingBucket(name: string, bucket: string) {
  openSummaryGroupingMenu(name);
  cy.findByRole("menu").findByRole("menuitem", { name: bucket }).click();
}
