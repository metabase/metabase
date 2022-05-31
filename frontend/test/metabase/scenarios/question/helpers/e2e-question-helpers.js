export const openQuestionActions = () => {
  cy.findAllByTestId("question-action-buttons-container").within(() => {
    cy.icon("ellipsis").click();
  });
};