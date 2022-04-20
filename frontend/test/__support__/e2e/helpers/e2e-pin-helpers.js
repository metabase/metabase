export function pinItem(item) {
  cy.findAllByText(item)
    .closest("tr")
    .within(() => {
      cy.icon("pin").click();
    });
}
