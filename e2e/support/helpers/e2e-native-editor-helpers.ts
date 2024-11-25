export function nativeEditor({ visible = true }: { visible?: boolean } = {}) {
  cy.findAllByTestId("loading-indicator").should("not.exist");

  const res = cy.get("[data-testid=native-query-editor] .ace_content");
  if (visible) {
    return res.should("be.visible");
  }
  return res;
}

export function focusNativeEditor() {
  nativeEditor().click();

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
