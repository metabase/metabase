export function expressionEditorWidget() {
  return cy.findByTestId("expression-editor");
}

export function expressionEditorTextfield() {
  return CustomExpressionEditor.get();
}

const isMac = Cypress.platform === "darwin";
const metaKey = isMac ? "Meta" : "Control";

export function enterCustomColumnDetails({
  formula,
  name,
  blur = true,
  format = false,
  allowFastSet = false,
}: {
  formula: string;

  /**
   * If set, sets the name of the custom column.
   */
  name?: string;

  /**
   * true by default. However, if you need to examine the popover in the test, it should be set to false so the popover is not dismissed.
   */
  blur?: boolean;

  /**
   * false by default. If set to true, the formula will be formatted
   * after being typed.
   */
  format?: boolean;

  /**
   *   Because CodeMirror uses a contenteditable div, and it is not possible to use cy.type() on it, we emulate .type with realPress.
   *   This does not always work, since realPress() does not support all characters. Setting this to true will enable an escape hatch
   *   that uses cy.invoke('text') under the hood, to allow for formulas that contain unsupported characters.
   *   This has some other side effects, like not triggering change handlers or not triggering autocomplte, so use it sparingly.
   */
  allowFastSet?: boolean;
}) {
  CustomExpressionEditor.get().as("formula");
  CustomExpressionEditor.clear();
  CustomExpressionEditor.type(formula, { allowFastSet });

  if (blur) {
    CustomExpressionEditor.blur();
  }

  if (format) {
    CustomExpressionEditor.format();
  }

  if (name) {
    cy.findByTestId("expression-name").clear().type(name).blur();
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
  /**
   * @param {string} text the formula to type
   * @param {Object} options
   * @param {boolean} [options.focus]
   *   true by default. Set to false to stop the helper from explicitly focussing the formula input.
   * @param {boolean} [options.allowFastSet]
   *   true by default. However, if you need to examine the popover in the test, it should be set to false so the popover is not dismissed
   *   Because CodeMirror uses a contenteditable div, and it is not possible to use cy.type() on it, we emulate .type with realPress.
   *   This does not always work, since realPress() does not support all characters. Setting this to true will enable an escape hatch
   *   that uses cy.invoke('text') under the hood, to allow for formulas that contain unsupported characters.
   *   This has some other sideeffects however, so use it sparingly.
   */
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
          return cy.realPress(["Home"]);

        case "{end}":
        case "{movetoend}":
          return cy.realPress(["End"]);

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
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789^[]()-,.;_!@#$%&*+=/<>\" ':;\\";
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
    cy.findByTestId("expression-editor").click("bottomRight", { force: true });
    return CustomExpressionEditor;
  },
  formatButton() {
    return cy.findByLabelText("Auto-format");
  },
  format() {
    CustomExpressionEditor.formatButton().click();
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
  textbox() {
    return CustomExpressionEditor.get().get("[role='textbox']");
  },
  value() {
    // Get the multiline text content of the editor
    return CustomExpressionEditor.textbox()
      .get(".cm-line")
      .then(lines => {
        const text: string[] = [];
        lines.each((_, line) => {
          text.push(line.textContent ?? "");
        });
        return text.join("\n");
      });
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
  acceptCompletion(key: "enter" | "tab" = "enter") {
    CustomExpressionEditor.completions().should("be.visible");

    // Avoid flakiness with CodeMirror not accepting the suggestion immediately
    cy.wait(300);
    CustomExpressionEditor.type(`{${key}}`, { focus: false });
  },
  selectCompletion(name: string) {
    CustomExpressionEditor.completions().should("be.visible");

    // Avoid flakiness with CodeMirror not accepting the suggestion immediately
    cy.wait(300);
    CustomExpressionEditor.completion(name).click();
  },
  helpTextHeader() {
    return cy.findByTestId("expression-helper-popover-structure");
  },
  helpText() {
    return cy.findByTestId("expression-helper");
  },
  paste(content: string) {
    CustomExpressionEditor.textbox().then(el => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", content);

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      });

      el[0].dispatchEvent(pasteEvent);
    });
  },
  nameInput() {
    return cy.findByTestId("expression-name");
  },
};
