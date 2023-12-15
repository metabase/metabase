declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Get an icon either unscoped, or chained to a previously yielded subject.
       * Uses jQuery under the hood.
       *
       * @example
       * cy.icon("bolt_filled").should("have.length", 4);
       * cy.findByTestId("app-bar").icon("add").click()
       */
      icon(iconName: string): Cypress.Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add(
  "icon",
  {
    prevSubject: "optional",
  },
  (subject, iconName) => {
    const SELECTOR = `.Icon-${iconName}`;

    return subject ? cy.wrap(subject).find(SELECTOR) : cy.get(SELECTOR);
  },
);

export {};
