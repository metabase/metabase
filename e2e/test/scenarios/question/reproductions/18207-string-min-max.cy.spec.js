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
    cy.contains("Minimum of").click();
    cy.findByText("Price");
    cy.findByText("Rating");
    cy.findByText("Ean").should("be.visible");
    cy.contains("Category").click();

    visualize();

    cy.findByText("Doohickey");
  });

  it("should be possible to use MAX on a string column (metabase#18207, metabase#22155)", () => {
    cy.contains("Maximum of").click();
    cy.findByText("Price");
    cy.findByText("Rating");
    cy.findByText("Ean").should("be.visible");
    cy.contains("Category").click();

    visualize();

    cy.findByText("Widget");
  });

  it("should be not possible to use AVERAGE on a string column (metabase#18207, metabase#22155)", () => {
    cy.contains("Average of").click();
    cy.findByText("Price");
    cy.findByText("Rating");
    cy.findByText("Ean").should("not.exist");
    cy.findByText("Category").should("not.exist");
  });

  it("should be possible to group by a string expression (metabase#18207)", () => {
    popover().contains("Custom Expression").click();
    popover().within(() => {
      enterCustomColumnDetails({ formula: "Max([Vendor])" });
      cy.findByPlaceholderText("Something nice and descriptive").type(
        "LastVendor",
      );
      cy.findByText("Done").click();
    });

    cy.contains("Pick a column to group by").click();
    popover().contains("Category").click();

    visualize();

    // Why is it not a table?
    cy.contains("Visualization").click();
    leftSidebar().within(() => {
      cy.icon("table").click();
      cy.findByTestId("Table-button").realHover();
      cy.icon("gear").click();
    });
    cy.contains("Done").click();

    cy.findByText("Zemlak-Wiegand");
  });
});
