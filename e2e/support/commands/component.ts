import type { MountOptions, MountReturn } from "cypress/react";
import { mount } from "cypress/react18";

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

Cypress.Commands.add("mount", mount); // used for Cypress Component Testing - https://docs.cypress.io/app/component-testing/react/overview
