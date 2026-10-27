import { onlyOn, skipOn } from "e2e/support/helpers/e2e-skip-test-helpers";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Skip the current test when the flag is true.
       * @example cy.skipOn(user === "nodata")
       */
      skipOn(flag: boolean): void;

      /**
       * Skip the current test unless the flag is true.
       * @example cy.onlyOn(dialect === "postgres")
       */
      onlyOn(flag: boolean): void;
    }
  }
}

Cypress.Commands.add("skipOn", skipOn);
Cypress.Commands.add("onlyOn", onlyOn);

export {};
