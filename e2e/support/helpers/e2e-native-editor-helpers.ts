import { popover } from "./e2e-ui-elements-helpers";

function nativeEditor() {
  cy.findAllByTestId("loading-indicator").should("not.exist");
  return cy.get("[data-testid=native-query-editor] .cm-content");
}

function focusNativeEditor() {
  nativeEditor().should("be.visible").click();

  nativeEditor().get(".cm-editor").should("have.class", "cm-focused");

  return nativeEditor();
}

function blurNativeEditor() {
  nativeEditor().get(".cm-editor").blur();
}

function nativeEditorCompletions() {
  return cy.get(".cm-tooltip-autocomplete").should("be.visible");
}

function nativeEditorCompletion(label: string) {
  return cy.get(".cm-completionLabel").contains(label).parent();
}

function nativeEditorSelectAll() {
  const isMac = Cypress.platform === "darwin";
  const metaKey = isMac ? "Meta" : "Control";
  focusNativeEditor().realPress([metaKey, "A"]);
  cy.get(".cm-selectionBackground").should("exist");
}

function clearNativeEditor() {
  nativeEditorSelectAll();
  cy.realPress(["Backspace"]);
}

export function nativeEditorDataSource() {
  return cy.findAllByTestId("gui-builder-data").first();
}

export function selectNativeEditorDataSource(name: string) {
  nativeEditorDataSource().click();
  popover().findByText(name).click();
}

type TypeOptions = {
  delay?: number;
  focus?: boolean;
};

function nativeEditorType(
  text: string,
  { delay = 10, focus = true }: TypeOptions = {},
) {
  if (focus) {
    focusNativeEditor();
  }

  const isMac = Cypress.platform === "darwin";
  const metaKey = isMac ? "Meta" : "Control";

  const parts = text.replaceAll("{{", "{{}{{}").split(/(\{[^}]+\})/);

  function type(text: string) {
    cy.realType(text, {
      pressDelay: delay,
    });
  }

  // HACK: realType does not accept a lot of common escape sequences,
  // so we implement them manually here for the native editor.
  parts.forEach(part => {
    switch (part.toLowerCase()) {
      case "":
        return;

      case "{clear}":
        return clearNativeEditor();

      case "{selectall}":
        return nativeEditorSelectAll();

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
      type("{");
      type(part.slice(1));
      return;
    }

    type(part);
  });

  return nativeEditor();
}

export const NativeEditor = {
  get: nativeEditor,
  type(text: string, options: TypeOptions = {}) {
    nativeEditorType(text, options);
    return NativeEditor;
  },
  focus() {
    focusNativeEditor();
    return NativeEditor;
  },
  blur() {
    blurNativeEditor();
    return NativeEditor;
  },
  selectAll() {
    nativeEditorSelectAll();
    return NativeEditor;
  },
  clear() {
    clearNativeEditor();
    return NativeEditor;
  },
  completions: nativeEditorCompletions,
  completion: nativeEditorCompletion,
};
