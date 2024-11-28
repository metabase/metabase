export function nativeEditor() {
  cy.findAllByTestId("loading-indicator").should("not.exist");
  return cy.get("[data-testid=native-query-editor] .cm-content");
}

export function focusNativeEditor() {
  nativeEditor().should("be.visible").click();

  nativeEditor().get(".cm-editor").should("have.class", "cm-focused");

  return nativeEditor();
}

export function blurNativeEditor() {
  nativeEditor().get(".cm-editor").blur();
}

export function nativeEditorCompletions() {
  return cy.get(".ace_autocomplete").should("be.visible");
}
