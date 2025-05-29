import {
  MetabaseProvider,
  type MetabaseProviderProps,
} from "@metabase/embedding-sdk-react";
import type { JSX } from "react";
import React from "react";

import { METABASE_INSTANCE_URL } from "e2e/support/helpers";
import { ThemeProvider } from "metabase/ui";

export const DEFAULT_SDK_AUTH_PROVIDER_CONFIG = {
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
};

export interface MountSdkContentOptions {
  sdkProviderProps?: Partial<MetabaseProviderProps>;
  strictMode?: boolean;
}

export function mountSdkContent(
  children: JSX.Element,
  { sdkProviderProps, strictMode = false }: MountSdkContentOptions = {},
) {
  cy.intercept("GET", "/api/user/current").as("getUser");

  const reactNode = (
    <ThemeProvider>
      <MetabaseProvider
        {...sdkProviderProps}
        authConfig={{
          ...DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
          ...sdkProviderProps?.authConfig,
        }}
      >
        {children}
      </MetabaseProvider>
    </ThemeProvider>
  );

  if (strictMode) {
    cy.mount(<React.StrictMode>{reactNode}</React.StrictMode>);
  } else {
    cy.mount(reactNode);
  }

  cy.wait("@getUser").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}
