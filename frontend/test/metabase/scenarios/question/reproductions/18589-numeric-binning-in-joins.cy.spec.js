import {
  restore,
  openOrdersTable,
  getNotebookStep,
  popover,
} from "__support__/e2e/cypress";

describe("issue 18589", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should not bin numeric fields in join condition by default (metabase#18589)", () => {
    openOrdersTable({ mode: "notebook" });

    joinTable("Reviews");
    selectFromDropdown("Quantity");
    selectFromDropdown("Rating");

    cy.findByText("Summarize").click();
    selectFromDropdown("Count of rows");

    getNotebookStep("summarize").within(() => {
      cy.icon("play").click();
      cy.wait("@dataset");
      cy.findByText("2,860,368");
    });
  });
});

function joinTable(table) {
  cy.findByText("Join data").click();
  popover()
    .findByText(table)
    .click();
}

function selectFromDropdown(option, clickOpts) {
  popover()
    .findByText(option)
    .click(clickOpts);
}
