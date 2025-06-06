import {
  MetabaseProvider,
  type MetabaseProviderProps,
} from "@metabase/embedding-sdk-react";
import type { JSX } from "react";
import React from "react";

import { signInAsAdminAndEnableEmbeddingSdkForE2e } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { ThemeProvider } from "metabase/ui";

export const METABASE_INSTANCE_URL = "http://localhost:4000";

const AUTH_PROVIDER_URL = "http://localhost/sso/metabase";

const JWT_SHARED_SECRET =
  "0000000000000000000000000000000000000000000000000000000000000000";

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

export function signInAsAdminAndEnableEmbeddingSdk() {
  Cypress.config("baseUrl", METABASE_INSTANCE_URL);

  signInAsAdminAndEnableEmbeddingSdkForE2e();

  cy.request("PUT", "/api/setting", {
    "jwt-enabled": true,
    "jwt-identity-provider-uri": AUTH_PROVIDER_URL,
    "jwt-shared-secret": JWT_SHARED_SECRET,
  });
}
