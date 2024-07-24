import { createQuestionAndDashboard } from "e2e/support/helpers";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { createQuestionAndDashboard } from "e2e/support/helpers"
       * ```
       */
      createQuestionAndDashboard: typeof createQuestionAndDashboard;
    }
  }
}

Cypress.Commands.add("createQuestionAndDashboard", createQuestionAndDashboard);
