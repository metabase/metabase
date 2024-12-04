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
  return cy.get(".cm-tooltip-autocomplete").should("be.visible");
}

export function nativeEditorCompletion(label: string) {
  return cy.get(".cm-completionLabel").contains(label).parent();
}

export function nativeEditorSelectAll() {
  focusNativeEditor();
  cy.realPress(["Meta", "A"]);
}

export function clearNativeEditor() {
  nativeEditorSelectAll();
  cy.realPress(["Backspace"]);
}

export function nativeEditorType(
  text: string,
  { delay = 10 }: { delay?: number } = {},
) {
  focusNativeEditor();

  const parts = text.split(/(}}|\]\]|{[^{}]+})/);

  // HACK: realType does not accept {{ foo }} and there is no way to escape it
  // so we break it up manually here.
  parts.forEach(part => {
    if (part === "}}" || part === "]]") {
      return;
    }

    if (part === "{clear}") {
      clearNativeEditor();
      return;
    }

    if (part === "{selectAll}") {
      nativeEditorSelectAll();
      return;
    }

    if (part === "{leftarrow}") {
      cy.realPress(["ArrowLeft"]);
      return;
    }

    if (part.startsWith("{") && part.endsWith("}")) {
      cy.realType("{").realType(part.slice(1), { pressDelay: delay });
      return;
    }

    cy.realType(part, {
      pressDelay: delay,
    });
  });

  return nativeEditor();
}
