Cypress.Commands.add(
  "paste",
  { prevSubject: "element" },
  (subject, text: string) => {
    cy.wrap(subject).then(($element) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      });

      console.log({ $element, element: $element[0], pasteEvent });

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
