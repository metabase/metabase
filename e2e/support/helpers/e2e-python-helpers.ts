function pythonEditor() {
  cy.findAllByTestId("loading-indicator").should("not.exist");
  return cy.get("[data-testid=python-editor] .cm-content");
}

function focusPythonEditor() {
  pythonEditor().should("be.visible").click();

  pythonEditor().get(".cm-editor").should("have.class", "cm-focused");

  return pythonEditor();
}

function blurPythonEditor() {
  pythonEditor().get(".cm-editor").blur();
}

function pythonEditorCompletions() {
  return cy.get(".cm-tooltip-autocomplete").should("be.visible");
}

function pythonEditorCompletion(label: string) {
  return cy.get(".cm-completionLabel").contains(label).parent();
}

function pythonEditorSelectAll() {
  const isMac = Cypress.platform === "darwin";
  const metaKey = isMac ? "Meta" : "Control";
  focusPythonEditor().realPress([metaKey, "A"]);
  cy.get(".cm-selectionBackground").should("exist");
}

function clearPythonEditor() {
  pythonEditorSelectAll();
  cy.realPress(["Backspace"]);
}

type TypeOptions = {
  delay?: number;
  focus?: boolean;
};

function pythonEditorType(
  text: string,
  { delay = 10, focus = true }: TypeOptions = {},
) {
  if (focus) {
    focusPythonEditor();
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
  // so we implement them manually here for the python editor.
  parts.forEach((part) => {
    switch (part.toLowerCase()) {
      case "":
        return;

      case "{clear}":
        return clearPythonEditor();

      case "{selectall}":
        return pythonEditorSelectAll();

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

  return pythonEditor();
}

export const PythonEditor = {
  get: pythonEditor,
  type(text: string, options: TypeOptions = {}) {
    pythonEditorType(text, options);
    return PythonEditor;
  },
  focus() {
    focusPythonEditor();
    return PythonEditor;
  },
  blur() {
    blurPythonEditor();
    return PythonEditor;
  },
  selectAll() {
    pythonEditorSelectAll();
    return PythonEditor;
  },
  clear() {
    clearPythonEditor();
    return PythonEditor;
  },
  textbox() {
    return PythonEditor.get().get("[role='textbox']");
  },
  value() {
    // Get the multiline text content of the editor
    return PythonEditor.textbox()
      .get(".cm-line")
      .then((lines) => {
        const text: string[] = [];
        lines.each((_, line) => {
          text.push(line.textContent ?? "");
        });
        const value = text.join("\n");
        const placeholder = "SELECT * FROM TABLE_NAME";
        if (value === placeholder) {
          return "";
        }
        return value;
      });
  },
  completions: pythonEditorCompletions,
  completion: pythonEditorCompletion,
};
