export function enterCustomColumnDetails({ formula, name } = {}) {
  cy.get(".ace_text-input")
    .first()
    .as("formula")
    .should("exist")
    .focus()
    .type(formula);

  if (name) {
    cy.findByPlaceholderText("Something nice and descriptive").type(name);
  }
}

export function checkExpressionEditorHelperPopoverPosition() {
  cy.findByTestId("expression-editor-textfield").then($target => {
    const textfieldPosition = $target[0].getBoundingClientRect();

    cy.findByTestId("expression-helper-popover", $target => {
      const popoverPosition = $target[0].getBoundingClientRect();

      expect(textfieldPosition.top - popoverPosition.top).toBeLessThan(
        textfieldPosition.height * 2,
      );
      expect(textfieldPosition.left - popoverPosition.left).toBeLessThan(10);
    });
  });
}
