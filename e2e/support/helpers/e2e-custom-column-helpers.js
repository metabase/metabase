export function expressionEditorWidget() {
  return cy.findByTestId("expression-editor");
}

export function getAceEditor() {
  return cy.get(".ace_text-input").first().should("exist");
}

/**
 * @param {Object} option
 * @param {string} option.formula
 * @param {string=} option.name
 */
export function enterCustomColumnDetails({ formula, name }) {
  getAceEditor().as("formula").focus().clear().type(formula);

  if (name) {
    cy.findByPlaceholderText("Something nice and descriptive")
      .clear()
      .type(name);
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
