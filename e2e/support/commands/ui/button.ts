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
        buttonName: string,
        timeout?: number,
      ): Cypress.Chainable<JQuery<HTMLElement>>;
      /**
       * Get a heading either unscoped, or chained to a previously yielded subject.
       * Uses `findByRole` under the hood.
       *
       * @example
       * cy.heading("Sample Database").click();
       * modal().heading("Save").click();
       */
      heading(
        headingName: string,
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

Cypress.Commands.add(
  "heading",
  {
    prevSubject: "optional",
  },
  (subject, headingNAme, timeout) => {
    const config = {
      name: headingNAme,
      timeout,
    };

    return subject
      ? cy.wrap(subject).findByRole("heading", config)
      : cy.findByRole("heading", config);
  },
);

export {};
