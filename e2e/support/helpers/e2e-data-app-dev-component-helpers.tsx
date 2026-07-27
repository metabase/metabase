import {
  DataAppDevProvider,
  DevToolbar,
  type DevToolbarProps,
} from "@metabase/embedding-sdk-react/data-app-dev";

import { DEFAULT_SDK_AUTH_PROVIDER_CONFIG } from "e2e/support/helpers/embedding-sdk-component-testing";

export const mountDevToolbar = (props: Partial<DevToolbarProps> = {}) =>
  cy.mount(
    <>
      <DataAppDevProvider
        appSlug="sales"
        authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
      >
        <div />
      </DataAppDevProvider>
      <DevToolbar {...props} />
    </>,
  );
