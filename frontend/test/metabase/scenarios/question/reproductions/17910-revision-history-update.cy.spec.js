import { restore, openOrdersTable, modal } from "__support__/e2e/helpers";

describe("issue 17910", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("revisions should work after creating a question without reloading (metabase#17910)", () => {
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
      cy.findByLabelText("Description").type("A description");
      cy.findByText("Save").click();
    });
    cy.findByText("History").click();
    cy.findByTestId("saved-question-history-list")
      .children()
      .should("have.length", 2);
  });
});
