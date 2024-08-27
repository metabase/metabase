export function expressionEditorWidget() {
  return cy.findByTestId("expression-editor");
}

export function enterCustomColumnDetails({
  formula,
  name,
}: {
  formula: string;
  name?: string;
}) {
  cy.get(".ace_text-input")
    .first()
    .as("formula")
    .should("exist")
    .focus()
    .clear()
    .type(formula);

  if (name) {
    cy.findByPlaceholderText("Something nice and descriptive")
      .clear()
      .type(name);
  }
}

export function checkExpressionEditorHelperPopoverPosition() {
  cy.findByTestId("expression-editor-textfield").then($target => {
    const textfieldPosition = $target[0].getBoundingClientRect();

    cy.findByTestId("expression-helper-popover").then($target => {
      const popoverPosition = $target[0].getBoundingClientRect();

      expect(textfieldPosition.top - popoverPosition.top).to.be.lessThan(
        textfieldPosition.height * 2,
      );
      expect(textfieldPosition.left - popoverPosition.left).to.be.lessThan(10);
    });
  });
}
