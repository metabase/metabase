declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Get a button either unscoped, or chained to a previously yielded subject.
       * Uses `findByRole` under the hood.
       *
       * @example
       * cy.button("Save").click();
       * modal().button("Save").click();
       */
      button(
        buttonName: string | RegExp,
        timeout?: number,
      ): Cypress.Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add(
  "button",
  {
    prevSubject: "optional",
  },
  (subject, buttonName, timeout) => {
    const config = {
      name: buttonName,
      timeout,
    };

    return subject
      ? cy.wrap(subject).findByRole("button", config)
      : cy.findByRole("button", config);
  },
);

export {};
