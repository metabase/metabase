import {
  restore,
  openOrdersTable,
  modal,
  questionInfoButton,
  rightSidebar,
} from "e2e/support/helpers";

describe("issue 17910", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("revisions should work after creating a question without reloading (metabase#17910)", () => {
    openOrdersTable();
    cy.intercept("POST", `/api/card`).as("card");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText("Save").click();
    });
    cy.wait("@card");
    modal().within(() => {
      cy.findByText("Not now").click();
    });

    questionInfoButton().click();

    rightSidebar().within(() => {
      cy.findAllByPlaceholderText("Add description")
        .type("A description")
        .blur();
      cy.findByText("History");
      cy.findByTestId("saved-question-history-list")
        .children()
        .should("have.length", 2);
    });
  });
});
