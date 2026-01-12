const nodes = {
  INPUT: window.HTMLInputElement.prototype,
  TEXTAREA: window.HTMLTextAreaElement.prototype,
} as const;

function getPrototype(
  node: string,
): (typeof nodes)[keyof typeof nodes] | undefined {
  return nodes[node as keyof typeof nodes];
}

Cypress.Commands.add(
  "paste",
  { prevSubject: "element" },
  (subject, text: string) => {
    cy.wrap(subject).then(($element) => {
      // Since Cypress cannot simulate native paste events, that are handled by React onChange,
      // we need to set the value manually and dispatch a change event.
      const nodeName = $element[0].nodeName;
      const prototype = getPrototype(nodeName);

      if (!prototype) {
        throw new Error(`Unsupported node type: ${nodeName}`);
      }

      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        prototype,
        "value",
      )?.set;
      nativeTextAreaValueSetter?.call($element[0], text);
      $element[0].dispatchEvent(new Event("change", { bubbles: true }));

      // Let's dispatch the simulated paste event in case components have onPaste handlers.dfs
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      });
      $element[0].dispatchEvent(pasteEvent);
    });

    return cy.wrap(subject);
  },
);

declare global {
  namespace Cypress {
    interface Chainable {
      paste(text: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}

export {};
