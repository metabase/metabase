export function expressionEditorWidget() {
  return cy.findByTestId("expression-editor");
}

export function expressionEditorTextfield() {
  return CustomExpressionEditor.get();
}

/**
 * @param {Object} option
 * @param {string} option.formula
 * @param {string=} option.name
 * @param {boolean} option.blur true by default. However, if you need to examine the popover in the test, it should be set to false so the popover is not dismissed
 */
export function enterCustomColumnDetails({
  formula,
  name,
  blur = true,
}: {
  formula: string;
  name?: string;
  blur?: boolean;
}) {
  CustomExpressionEditor.get().as("formula");
  CustomExpressionEditor.clear().type(formula);

  if (blur) {
    // click outside the expression editor
    cy.get("label[for='expression-content']").click();
  }

  if (name) {
    cy.findByPlaceholderText("Something nice and descriptive")
      .clear()
      .type(name)
      .blur();
  }
}

export function checkExpressionEditorHelperPopoverPosition() {
  expressionEditorTextfield().then($target => {
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

export const CustomExpressionEditor = {
  get() {
    return cy.findByTestId("custom-expression-query-editor");
  },
  type(text: string) {
    // Enter the formula.
    // HACK: we do invoke("text") instead of type() because type() does not work on
    // CodeMirror elements in Cypress. realType() would work but some of the formulas
    // contain special characters that are not supported by realType().
    CustomExpressionEditor.get().findByRole("textbox").invoke("text", text);
    return CustomExpressionEditor;
  },
  focus() {
    CustomExpressionEditor.get().click();
    return CustomExpressionEditor;
  },
  selectAll() {
    CustomExpressionEditor.focus();
    cy.realPress(["Meta", "A"]);
    return CustomExpressionEditor;
  },
  clear() {
    CustomExpressionEditor.selectAll();
    cy.realPress(["Backspace"]);
    return CustomExpressionEditor;
  },
  shouldContain(formula: string) {
    return expressionEditorTextfield()
      .get(".cm-content")
      .should("contain", formula);
  },
};
