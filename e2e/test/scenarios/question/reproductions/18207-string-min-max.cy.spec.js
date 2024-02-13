import {
  enterCustomColumnDetails,
  popover,
  restore,
  visualize,
  openProductsTable,
  summarize,
  leftSidebar,
} from "e2e/support/helpers";

describe("issue 18207", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
  });

  it("should be possible to use MIN on a string column (metabase#18207, metabase#22155)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Minimum of").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Price");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ean").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Category").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey");
  });

  it("should be possible to use MAX on a string column (metabase#18207, metabase#22155)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Maximum of").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Price");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ean").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Category").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Widget");
  });

  it("should be not possible to use AVERAGE on a string column (metabase#18207, metabase#22155)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Average of").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Price");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ean").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").should("not.exist");
  });

  it("should be possible to group by a string expression (metabase#18207)", () => {
    popover().contains("Custom Expression").click();
    popover().within(() => {
      enterCustomColumnDetails({
        formula: "Max([Vendor])",
        name: "LastVendor",
      });
      cy.findByText("Done").click();
    });

    cy.findByTestId("aggregate-step").contains("LastVendor").should("exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pick a column to group by").click();
    popover().contains("Category").click();

    visualize();

    // Why is it not a table?
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    leftSidebar().within(() => {
      cy.icon("table").click();
      cy.findByTestId("Table-button").realHover();
      cy.icon("gear").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Done").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Zemlak-Wiegand");
  });
});
