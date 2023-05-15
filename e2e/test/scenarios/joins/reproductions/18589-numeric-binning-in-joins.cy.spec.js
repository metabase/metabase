import {
  restore,
  openOrdersTable,
  visualize,
  popover,
  summarize,
} from "e2e/support/helpers";

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

    summarize({ mode: "notebook" });
    selectFromDropdown("Count of rows");

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2,860,368");
  });
});

function joinTable(table) {
  cy.findByText("Join data").click();
  popover().findByText(table).click();
}

function selectFromDropdown(option, clickOpts) {
  popover().findByText(option).click(clickOpts);
}
