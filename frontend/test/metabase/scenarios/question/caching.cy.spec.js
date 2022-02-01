import {
  restore,
  describeWithToken,
  mockSessionProperty,
  modal,
} from "__support__/e2e/cypress";

describeWithToken("scenarios > question > caching", () => {
  beforeEach(() => {
    restore();
    mockSessionProperty("enable-query-caching", true);
    cy.signInAsAdmin();
  });

  it("can set cache ttl for a saved question", () => {
    cy.intercept("PUT", "/api/card/1").as("updateQuestion");
    cy.visit("/question/1");

    openEditingModalForm();
    modal().within(() => {
      cy.findByText("More options").click();
      cy.findByPlaceholderText("24").clear().type("48").blur();
      cy.button("Save").click();
    });

    cy.wait("@updateQuestion");
    cy.reload();

    openEditingModalForm();
    modal().within(() => {
      cy.findByText("More options").click();
      cy.findByDisplayValue("48").clear().type("0").blur();
      cy.button("Save").click();
    });

    cy.wait("@updateQuestion");
    cy.reload();

    openEditingModalForm();
    modal().within(() => {
      cy.findByText("More options").click();
      cy.findByPlaceholderText("24");
    });
  });
});

function openEditingModalForm() {
  cy.findByTestId("saved-question-header-button").click();
  cy.findByTestId("edit-details-button").click();
}
