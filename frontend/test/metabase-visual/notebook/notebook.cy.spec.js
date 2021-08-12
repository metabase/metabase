import { restore, popover } from "__support__/e2e/cypress";

describe("visual tests > notebook > major UI elements", () => {
  const VIEWPORT_WIDTH = 2200;
  const VIEWPORT_HEIGHT = 1200;

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  });

  it("renders correctly", () => {
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Orders").click();

    addJoin({
      rightTable: "Products",
    });

    addCustomColumn({
      name: "Total square root (no reason)",
      formula: "sqrt([Total])",
    });

    addSingleValueFilter({
      field: "Total",
      filterType: "Greater than",
      filterValue: "10",
    });

    summarize({ metric: "Average of ...", field: "Quantity" });
    groupBy({ field: "User ID" });

    addSorting({ field: "Average of Quantity" });
    setRowLimit(500);

    cy.percySnapshot(
      "visual tests > notebook > major UI elements renders correctly",
      {
        minHeight: VIEWPORT_HEIGHT,
      },
    );
  });
});

function selectFromDropdown(itemName) {
  return popover().findByText(itemName);
}

function addJoin({ rightTable }) {
  cy.icon("join_left_outer")
    .last()
    .click();

  selectFromDropdown(rightTable).click();
}

function addCustomColumn({ name, formula }) {
  cy.icon("add_data").click();
  cy.focused().type(formula);
  cy.findAllByPlaceholderText("Something nice and descriptive").type(name);
  cy.button("Done").click();
}

function addSingleValueFilter({ field, filterType, filterValue }) {
  cy.findByText("Add filters to narrow your answer").click();
  selectFromDropdown(field).click();
  popover()
    .get(".AdminSelect")
    .click();
  selectFromDropdown(filterType).click();
  popover().within(() => {
    cy.get("input").type(filterValue);
    cy.button("Add filter").click();
  });
}

function summarize({ metric, field }) {
  cy.findByText("Pick the metric you want to see").click();
  selectFromDropdown(metric).click();
  selectFromDropdown(field).click();
}

function groupBy({ field }) {
  cy.findByText("Pick a column to group by").click();
  selectFromDropdown(field).click();
}

function addSorting({ field }) {
  cy.findByText("Sort").click();
  selectFromDropdown(field).click();
}

function setRowLimit(rowLimit) {
  cy.findByText("Row limit").click();
  cy.findByPlaceholderText("Enter a limit").type(String(rowLimit));
}
