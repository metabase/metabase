export const confirmModal = () =>
  cy.findByTestId("confirm-modal").should("be.visible");

export const cancelConfirmationModal = () =>
  confirmModal()
    .findByRole("button", { name: /Cancel/ })
    .click();
