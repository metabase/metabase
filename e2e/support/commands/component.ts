// We need to use the `mount` function from `@cypress/react` to allow
// running SDK component tests on multiple React versions
import { type MountOptions, type MountReturn, mount } from "@cypress/react";
import { mount as mountReact18 } from "cypress/react18";

import { getMajorReactVersion } from "metabase/lib/compat/check-version";

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

const MAJOR_REACT_VERSION = getMajorReactVersion();

// Used for Cypress Component Testing - https://docs.cypress.io/app/component-testing/react/overview
// React 19 -> @cypress/react@^9
// React 18 -> cypress/react18 (internal package in Cypress 13, using @cypress/react@^8 does not work)
// React 17 -> @cypress/react@^8
// See bin/embedding-sdk/change-react-version.bash for how running component tests across React versions is managed.
const mountComponentFn = MAJOR_REACT_VERSION === 18 ? mountReact18 : mount;

Cypress.Commands.add("mount", mountComponentFn);
