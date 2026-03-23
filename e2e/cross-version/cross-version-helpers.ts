export function saveSimpleQuestion(name: string) {
  cy.intercept("POST", "/api/card").as("saveQuestion");
  cy.findByTestId("qb-header").button("Save").click();
  cy.findByTestId("save-question-modal").within(() => {
    cy.findByLabelText("Name").clear().type(name);
    cy.button("Save").click();
    cy.wait("@saveQuestion");
  });
}
