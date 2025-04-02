// We need to use the `mount` function from `@cypress/react` to allow
// running SDK component tests on multiple React versions
import { type MountOptions, type MountReturn, mount } from "cypress/react";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Mounts a React node
       * @param component React Node to mount
       * @param options Additional options to pass into mount
       */
      mount(
        component: React.ReactNode,
        options?: MountOptions,
      ): Cypress.Chainable<MountReturn>;
    }
  }
}

Cypress.Commands.add("mount", mount);
