type TypeOptions = {
  delay?: number;
  focus?: boolean;
  allowFastSet?: boolean;
};

export function codeMirrorHelpers<T extends object>(testId: string, extra: T) {
  const helpers = {
    get() {
      cy.findAllByTestId("loading-indicator").should("not.exist");
      return cy.get(`[data-testid=${testId}] .cm-content`);
    },
    focus() {
      helpers.get().should("be.visible").focus();
      // Move caret to end
      const isMac = Cypress.platform === "darwin";
      cy.realPress([isMac ? "Meta" : "Control", "End"]);

      helpers.get().get(".cm-editor").should("have.class", "cm-focused");
      return helpers;
    },
    blur() {
      helpers.get().get(".cm-content").blur();
      return helpers;
    },
    selectAll() {
      const isMac = Cypress.platform === "darwin";
      const metaKey = isMac ? "Meta" : "Control";
      helpers.focus();
      cy.realPress([metaKey, "A"]);
      return helpers;
    },
    clear() {
      helpers.selectAll();
      cy.realPress(["Backspace"]);
      return helpers;
    },
    type(
      text: string,
      { focus = true, delay = 10, allowFastSet = false }: TypeOptions = {},
    ) {
      if (focus) {
        helpers.focus();
      }

      if (allowFastSet) {
        // Enter the formula in one go
        // HACK: we do invoke("text") instead of type() because type() does not work on
        // CodeMirror elements in Cypress. realType() would work but some of the formulas
        // contain special characters that are not supported by realType().
        helpers.get().invoke("text", text);

        // invoke("text") does not trigger the validator, so we need to trigger it manually
        // by typing something
        helpers.type(" {backspace}");

        return helpers;
      }

      const isMac = Cypress.platform === "darwin";
      const metaKey = isMac ? "Meta" : "Control";

      const parts = text.replaceAll("{{", "{{}{{}").split(/(\{[^}]+\})/);

      function insert(text: string) {
        cy.realType(text, { pressDelay: delay });
      }

      // HACK: realType does not accept a lot of common escape sequences,
      // so we implement them manually here for the native editor.
      parts.forEach((part) => {
        switch (part.toLowerCase()) {
          case "":
            return;

          case "{clear}":
            return helpers.clear();

          case "{selectall}":
            return helpers.selectAll();

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
          insert("{");
          insert(part.slice(1));
          return;
        }

        // realType does not support → arrow, so we replace it with ->, which the editor
        // expands into →
        const unexpanded = part.replaceAll(/→/g, "->");
        const alphabet =
          "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789^[]()-,.;_!@#$%&*+=/<>\" ':;\\\n{}";
        if (unexpanded.split("").some((char) => !alphabet.includes(char))) {
          throw new Error(
            `unknown character in codeMirrorHelpers.type in ${part}`,
          );
        }

        insert(unexpanded);
      });

      return helpers;
    },
    textbox() {
      return helpers.get().get("[role='textbox']");
    },
    value() {
      // Get the multiline text content of the editor
      return helpers
        .textbox()
        .get(".cm-line")
        .then((lines) => {
          const text: string[] = [];
          lines.each((_, line) => {
            const placeholder = line.querySelector(".cm-placeholder");
            if (placeholder) {
              return;
            }
            text.push(line.textContent ?? "");
          });
          return text.join("\n");
        });
    },
    completions() {
      return cy.get(".cm-tooltip-autocomplete").should("be.visible");
    },
    completion(label: string) {
      return cy.get(".cm-completionLabel").contains(label).parent();
    },
    acceptCompletion(key: "enter" | "tab" = "enter") {
      helpers.completions().should("be.visible");

      // Avoid flakiness with CodeMirror not accepting the suggestion immediately
      cy.wait(300);
      helpers.type(`{${key}}`, { focus: false });
    },
    rejectCompletion() {
      helpers.completions().should("be.visible");

      // Avoid flakiness with CodeMirror not processing the escape immediately
      cy.wait(300);
      cy.realPress(["Escape"]);
    },
    selectCompletion(name: string) {
      helpers.completions().should("be.visible");

      // Avoid flakiness with CodeMirror not accepting the suggestion immediately
      cy.wait(300);
      helpers.completion(name).click();
    },
    paste(content: string) {
      helpers.textbox().then((el) => {
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
    ...extra,
  };

  return helpers;
}

export function codeMirrorEditor() {
  return cy.get(".cm-content");
}

export function codeMirrorValue() {
  // Get the multiline text content of the editor
  return codeMirrorEditor()
    .get("[role='textbox']")
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
}
