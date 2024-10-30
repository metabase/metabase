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
  return cy.wrap(null).then(function () {
    const matchingAliases = Object.keys(this).filter(alias =>
      pattern.test(alias),
    );

    console.log("matchingAliases", Object.keys(this));
    console.log("matchingAliases", matchingAliases);

    if (matchingAliases.length === 0) {
      throw new Error(`No aliases found matching pattern: ${pattern}`);
    }

    return cy.wait("@" + matchingAliases[0]).then(responses => {
      Cypress.log({
        id: "waitAlias",
        consoleProps: () => ({
          Pattern: pattern,
          "Matched Aliases": matchingAliases,
          Responses: responses,
        }),
        message: `${pattern.toString()} (${matchingAliases.length} matches)`,
        displayName: "waitAlias",
        type: "parent",
      });

      return responses;
    });
  });
});
