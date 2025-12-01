export const confirmModal = () =>
  cy.findByTestId("confirm-modal").should("be.visible");
