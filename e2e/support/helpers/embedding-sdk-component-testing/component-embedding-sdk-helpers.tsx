import {
  MetabaseProvider,
  type MetabaseProviderProps,
} from "@metabase/embedding-sdk-react";
import type { JSX } from "react";
import React from "react";

import { METABASE_INSTANCE_URL } from "e2e/support/helpers";
import type { DeepPartial } from "metabase/embedding-sdk/types/utils";
import { ThemeProvider } from "metabase/ui";

export const DEFAULT_SDK_AUTH_PROVIDER_CONFIG = {
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
};

export interface MountSdkOptions {
  strictMode?: boolean;
}

export function mountSdk(
  children: JSX.Element,
  { strictMode = false }: MountSdkOptions = {},
) {
  return strictMode
    ? cy.mount(<React.StrictMode>{children}</React.StrictMode>)
    : cy.mount(children);
}

export interface MountSdkContentOptions extends MountSdkOptions {
  sdkProviderProps?: DeepPartial<MetabaseProviderProps>;
  waitForUser?: boolean;
}

export function mountSdkContent(
  children: JSX.Element,
  {
    sdkProviderProps,
    strictMode = false,
    waitForUser = true,
  }: MountSdkContentOptions = {},
) {
  const isGuest = !!sdkProviderProps?.authConfig?.isGuest;

  if (!isGuest) {
    cy.intercept("GET", "/api/user/current").as("getUser");
  }

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

  if (!isGuest && waitForUser) {
    // When running stress tests with network throttling, the request can take longer to complete
    // as it first needs to fetch the bundle from the server
    cy.wait("@getUser", { timeout: 20_000 }).then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });
  }
}

export function getSdkBundleScriptElement(): HTMLScriptElement | null {
  return document.querySelector('[data-embedding-sdk-bundle="true"]');
}
