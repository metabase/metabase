import { restore } from "__support__/e2e/helpers";

describe("scenarios > models > create", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("creates a native query model via the New button", () => {
    cy.visit("/");

    cy.findByText("New").click();
    cy.findByText("Model").click();
    cy.findByText("Use a native query").click();

    cy.get(".ace_editor").should("be.visible").type("select * from ORDERS");

    cy.findByText("Save").click();

    cy.findByPlaceholderText("What is the name of your model?").type("A name");

    cy.findByText("Save").click();

    cy.findByText("Saved");
  });
});
