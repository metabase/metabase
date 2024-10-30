export {};

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Waits for aliases that match the provided regex pattern
       * @param pattern - Regular expression to match against aliases
       * @example
       * cy.waitAlias(/api\/dashboard\/\d+/)
       */
      waitAlias(pattern: RegExp): Chainable<any>;
    }
  }
}

Cypress.Commands.add("waitAlias", function (this: any, pattern: RegExp) {
  return cy.wrap(null, { log: false }).then(function () {
    const matchingAliases = Object.keys(this).filter(alias =>
      pattern.test(alias),
    );

    if (matchingAliases.length === 0) {
      throw new Error(`No aliases found matching pattern: ${pattern}`);
    }

    return cy.wait("@" + matchingAliases[0]);
  });
});
