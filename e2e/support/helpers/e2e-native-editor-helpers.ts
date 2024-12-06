export function nativeEditor() {
  cy.findAllByTestId("loading-indicator").should("not.exist");
  return cy.get("[data-testid=native-query-editor] .ace_content");
}

export function focusNativeEditor() {
  nativeEditor().should("be.visible").click();

  return cy
    .findByTestId("native-query-editor")
    .should("have.class", "ace_focus");
}

export function blurNativeEditor() {
  cy.get(".ace_text-input").blur();
}

export function nativeEditorCompletions() {
  return cy.get(".ace_autocomplete").should("be.visible");
}
