import type { PropsWithChildren } from "react";

import {
  MetabaseProvider,
  type MetabaseProviderWebComponentProperties,
} from "embedding-sdk";
import { ShadowRootProvider } from "metabase/embedding-sdk/components";

export type WebComponentProvidersProps = {
  metabaseProviderProps?: MetabaseProviderWebComponentProperties;
};

export const WebComponentProviders = ({
  children,
  metabaseProviderProps,
}: PropsWithChildren<WebComponentProvidersProps>) => {
  const { authConfig, locale, theme } = metabaseProviderProps ?? {};

  if (!authConfig || !Object.keys(authConfig).length) {
    return null;
  }

  if (!ShadowRootProvider || !MetabaseProvider) {
    return null;
  }

  return (
    <ShadowRootProvider>
      <MetabaseProvider authConfig={authConfig} locale={locale} theme={theme}>
        {children}
      </MetabaseProvider>
    </ShadowRootProvider>
  );
};
