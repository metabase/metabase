declare global {
  namespace Cypress {
    interface Chainable {
      findByTextEnsureVisible(
        text: string,
      ): Cypress.Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add("findByTextEnsureVisible", text => {
  cy.findByText(text).should("be.visible");
});

export {};
