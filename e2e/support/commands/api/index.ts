import {
  archiveCollection,
  archiveDashboard,
  createCollection,
  createDashboard,
  createNativeQuestion,
  createQuestion,
  createQuestionAndDashboard,
} from "e2e/support/helpers";

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
       * import { archiveDashboard } from "e2e/support/helpers"
       * ```
       */
      archiveDashboard: typeof archiveDashboard;

      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { createCollection } from "e2e/support/helpers"
       * ```
       */
      createCollection: typeof createCollection;

      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { createDashboard } from "e2e/support/helpers"
       * ```
       */
      createDashboard: typeof createDashboard;

      /**
       * @deprecated Use function helper instead, i.e.
       * ```
       * import { createNativeQuestion } from "e2e/support/helpers"
       * ```
       */
      createNativeQuestion: typeof createNativeQuestion;

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
       * import { createQuestionAndDashboard } from "e2e/support/helpers"
       * ```
       */
      createQuestionAndDashboard: typeof createQuestionAndDashboard;
    }
  }
}

Cypress.Commands.add("archiveCollection", archiveCollection);
Cypress.Commands.add("archiveDashboard", archiveDashboard);
Cypress.Commands.add("createCollection", createCollection);
Cypress.Commands.add("createDashboard", createDashboard);
Cypress.Commands.add("createNativeQuestion", createNativeQuestion);
Cypress.Commands.add("createQuestion", createQuestion);
Cypress.Commands.add("createQuestionAndDashboard", createQuestionAndDashboard);
