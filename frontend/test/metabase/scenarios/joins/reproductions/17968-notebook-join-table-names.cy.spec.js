import { restore, popover, openOrdersTable } from "__support__/e2e/cypress";

describe("issue 17968", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  it("shows correct table names when joining many tables (metabase#17968)", () => {
    openOrdersTable({ mode: "notebook" });

    cy.findByText("Join data").click();
    popover().findByText("Products").click();

    cy.findByTestId("action-buttons").findByText("Join data").click();
    popover().findByText("Reviews").click();

    popover().within(() => {
      cy.findByText("Products").click();
      cy.findByText("ID").click();
    });

    popover().findByText("Product ID").click();

    cy.findByTestId("step-join-0-1")
      .findByTestId("parent-dimension")
      .findByText("Products");
  });
});
