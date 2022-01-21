import {
  enterCustomColumnDetails,
  popover,
  restore,
  visualize,
} from "__support__/e2e/cypress";

describe("issue 18207", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should be possible to use MIN on a string column (metabase#18207)", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Products").click();

    cy.contains("Pick the metric").click();

    cy.contains("Minimum of").click();
    cy.findByText("Price");
    cy.findByText("Rating");
    cy.contains("Category").click();

    visualize();

    cy.findByText("Doohickey");
  });

  it("should be possible to use MAX on a string column (metabase#18207)", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Products").click();

    cy.contains("Pick the metric").click();

    cy.contains("Maximum of").click();
    cy.findByText("Price");
    cy.findByText("Rating");
    cy.contains("Category").click();

    visualize();

    cy.findByText("Widget");
  });

  it("should be not possible to use AVERAGE on a string column (metabase#18207)", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Products").click();

    cy.contains("Pick the metric").click();

    cy.contains("Average of").click();
    cy.findByText("Price");
    cy.findByText("Rating");
    cy.findByText("Category").should("not.exist");
  });

  it("should be possible to group by a string expression (metabase#18207)", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Products").click();

    cy.contains("Pick the metric").click();
    popover()
      .contains("Custom Expression")
      .click();
    popover().within(() => {
      enterCustomColumnDetails({ formula: "Max([Vendor])" });
      cy.findByPlaceholderText("Name (required)").type("LastVendor");
      cy.findByText("Done").click();
    });

    cy.contains("Pick a column to group by").click();
    popover()
      .contains("Category")
      .click();

    visualize();

    // Why is it not a table?
    cy.contains("Settings").click();
    cy.contains("Bar options").click();
    cy.get("[data-testid=Table-button]").click();
    cy.contains("Done").click();

    cy.findByText("Zemlak-Wiegand");
  });
});
