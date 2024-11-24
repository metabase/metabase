export function nativeEditor() {
  cy.findAllByTestId("loading-indicator").should("not.exist");
  return cy.findByTestId("native-query-editor").should("be.visible");
}
