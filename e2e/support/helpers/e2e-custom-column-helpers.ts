import { popover } from "e2e/support/helpers/e2e-ui-elements-helpers";

import { codeMirrorHelpers } from "./e2e-codemirror-helpers";

export function expressionEditorWidget() {
  return cy.findByTestId("expression-editor");
}

export function expressionEditorTextfield() {
  return CustomExpressionEditor.get();
}

export function enterCustomColumnDetails({
  formula,
  name,
  blur = true,
  format = false,
  allowFastSet = false,
  clickDone = false,
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

  /**
   * set to true to click the done button after setting the detauls to save the custom column.
   */
  clickDone?: boolean;
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

  if (clickDone) {
    popover().button("Done").click();
  }
}

export const CustomExpressionEditor = codeMirrorHelpers(
  "custom-expression-query-editor",
  {
    formatButton() {
      return cy.findByLabelText("Auto-format");
    },
    format() {
      CustomExpressionEditor.formatButton().should("be.visible");
      CustomExpressionEditor.formatButton().click();
      return CustomExpressionEditor;
    },
    helpTextHeader() {
      return cy.findByTestId("expression-helper-popover-structure");
    },
    helpText() {
      return cy.findByTestId("expression-helper");
    },
    nameInput() {
      return cy.findByTestId("expression-name");
    },
    functionBrowser() {
      return cy.findByTestId("expression-editor-function-browser");
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
    blur() {
      cy.findByTestId("expression-editor").click("bottomRight", {
        force: true,
      });
      return CustomExpressionEditor;
    },
  },
);
