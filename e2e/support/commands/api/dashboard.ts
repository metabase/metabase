import { archiveDashboard, createDashboard } from "e2e/support/helpers";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { archiveDashboard } from "e2e/support/helpers"
       * ```
       */
      archiveDashboard: typeof archiveDashboard;

      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { createDashboard } from "e2e/support/helpers"
       * ```
       */
      createDashboard: typeof createDashboard;
    }
  }
}

Cypress.Commands.add("archiveDashboard", archiveDashboard);
Cypress.Commands.add("createDashboard", createDashboard);
