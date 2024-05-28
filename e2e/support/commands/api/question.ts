import { createNativeQuestion, createQuestion } from "e2e/support/helpers";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { createQuestion } from "e2e/support/helpers"
       * ```
       */
      createQuestion: typeof createQuestion;

      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { createNativeQuestion } from "e2e/support/helpers"
       * ```
       */
      createNativeQuestion: typeof createNativeQuestion;
    }
  }
}

Cypress.Commands.add("createQuestion", createQuestion);
Cypress.Commands.add("createNativeQuestion", createNativeQuestion);
