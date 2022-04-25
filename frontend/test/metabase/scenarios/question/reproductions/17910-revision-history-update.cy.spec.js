import { restore, openOrdersTable, modal } from "__support__/e2e/cypress";

describe("issue 17910", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("Revisions should work after creating a question without reloading", () => {
    openOrdersTable();
    cy.intercept("POST", `/api/card`).as("card");
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText("Save").click();
    });
    cy.wait("@card");
    modal().within(() => {
      cy.findByText("Not now").click();
    });
    cy.findByTestId("saved-question-header-button").click();
    cy.findByText("Add a description").click();
    modal().within(() => {
      cy.get("textarea[name=description]").type("A description");
      cy.findByText("Save").click();
    });
    cy.findByText("History").click();
    cy.findByText("History")
      .siblings()
      .first()
      .find("ul")
      .children()
      .should("to.have.length", 2);
  });
});
