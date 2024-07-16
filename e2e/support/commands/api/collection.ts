import { archiveCollection, createCollection } from "e2e/support/helpers";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { archiveCollection } from "e2e/support/helpers"
       * ```
       */
      archiveCollection: typeof archiveCollection;

      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { createCollection } from "e2e/support/helpers"
       * ```
       */
      createCollection: typeof createCollection;
    }
  }
}

Cypress.Commands.add("archiveCollection", archiveCollection);
Cypress.Commands.add("createCollection", createCollection);
