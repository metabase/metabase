import {
  restore,
  openOrdersTable,
  modal,
  questionInfoButton,
  rightSidebar,
} from "__support__/e2e/helpers";

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
