export function expressionEditorWidget() {
  return cy.findByTestId("expression-editor");
}

export function expressionEditorTextfield() {
  return CustomExpressionEditor.get();
}

const isMac = Cypress.platform === "darwin";
const metaKey = isMac ? "Meta" : "Control";

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
  allowFastSet = false,
}: {
  formula: string;
  name?: string;
  blur?: boolean;
  allowFastSet?: boolean;
}) {
  CustomExpressionEditor.get().as("formula");
  CustomExpressionEditor.clear();
  cy.wait(100);
  CustomExpressionEditor.type(formula, { allowFastSet });

  if (blur) {
    CustomExpressionEditor.blur();
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
  type(
    text: string,
    {
      allowFastSet = false,
      focus = true,
    }: {
      focus?: boolean;
      allowFastSet?: boolean;
    } = {},
  ) {
    if (focus) {
      CustomExpressionEditor.focus();
    }

    if (allowFastSet) {
      // Enter the formula in one go
      // HACK: we do invoke("text") instead of type() because type() does not work on
      // CodeMirror elements in Cypress. realType() would work but some of the formulas
      // contain special characters that are not supported by realType().
      CustomExpressionEditor.get().findByRole("textbox").invoke("text", text);
      return CustomExpressionEditor;
    }

    const parts = text.replaceAll("{{", "{{}{{}").split(/(\{[^}]+\})/);

    parts.forEach(part => {
      switch (part.toLowerCase()) {
        case "":
          return;

        case "{clear}":
          return CustomExpressionEditor.clear();

        case "{selectall}":
          return CustomExpressionEditor.selectAll();

        case "{leftarrow}":
          return cy.realPress(["ArrowLeft"]);

        case "{rightarrow}":
          return cy.realPress(["ArrowRight"]);

        case "{downarrow}":
          return cy.realPress(["ArrowDown"]);

        case "{uparrow}":
          return cy.realPress(["ArrowUp"]);

        case "{enter}":
          return cy.realPress(["Enter"]);

        case "{home}":
        case "{movetostart}":
          return cy.realPress(["Control", "A"]);

        case "{end}":
        case "{movetoend}":
          return cy.realPress(["Control", "E"]);

        case "{backspace}":
          return cy.realPress(["Backspace"]);

        case "{tab}":
          return cy.realPress(["Tab"]);

        case "{nextcompletion}":
          cy.wait(50);
          return cy.realPress([metaKey, "j"]);

        case "{prevcompletion}":
          cy.wait(50);
          return cy.realPress([metaKey, "k"]);

        case "{{}":
          return cy.realType("{");
      }

      if (part.startsWith("{") && part.endsWith("}")) {
        // unknown escape sequence, let's try typing it
        throw new Error(
          `unknown escape sequence in CustomExpressionEditor.type: ${part}`,
        );
      }

      // realType does not support → arrow, so we replace it with ->, which the editor
      // expands into →
      const unexpanded = part.replaceAll(/→/g, "->");

      const alphabet =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789^[]()-,.;_!@#$%&*+=/<>\" ':;";
      if (unexpanded.split("").some(char => !alphabet.includes(char))) {
        throw new Error(
          `unknown character in CustomExpressionEditor.type in ${part}`,
        );
      }

      cy.realType(unexpanded);
    });
    return CustomExpressionEditor;
  },
  focus() {
    CustomExpressionEditor.get().click("right");
    return CustomExpressionEditor;
  },
  blur() {
    // click outside the expression editor
    cy.get("label[for='expression-content']").click();
    return CustomExpressionEditor;
  },
  selectAll() {
    CustomExpressionEditor.focus();
    cy.realPress([metaKey, "A"]);
    return CustomExpressionEditor;
  },
  clear() {
    CustomExpressionEditor.selectAll();
    cy.realPress(["Backspace"]);
    return CustomExpressionEditor;
  },
  shouldContain(formula: string) {
    return CustomExpressionEditor.get()
      .get("[role='textbox']")
      .invoke("text")
      .should("contain", formula);
  },

  completions() {
    return cy.findByTestId("custom-expression-editor-suggestions");
  },
  completion(name: string) {
    return CustomExpressionEditor.completions()
      .findAllByRole("option")
      .contains(name)
      .first();
  },
  helpText() {
    return cy.findByTestId("expression-helper");
  },
};
