import { restore } from "__support__/e2e/helpers";

describe("scenarios > models > create", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("creates a native query model via the New button", () => {
    cy.visit("/");

    goFromHomePageToNewNativeQueryModelPage();

    // Cancel creation with confirmation modal
    cy.findByText("Cancel").click();
    cy.findByText("Discard").click();

    // Now we will create a model
    goFromHomePageToNewNativeQueryModelPage();

    cy.get(".ace_editor").should("be.visible").type("select * from ORDERS");

    cy.findByText("Save").click();

    cy.findByPlaceholderText("What is the name of your model?").type("A name");

    cy.findByText("Save").click();

    cy.findByText("Saved");
  });
});

function goFromHomePageToNewNativeQueryModelPage() {
  cy.findByText("New").click();
  cy.findByText("Model").click();
  cy.findByText("Use a native query").click();
}
