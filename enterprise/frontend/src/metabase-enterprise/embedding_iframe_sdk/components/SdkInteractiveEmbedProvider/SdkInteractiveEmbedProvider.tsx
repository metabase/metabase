import type { Action, Store } from "@reduxjs/toolkit";
import { type ReactNode, useEffect } from "react";

import type { MetabaseAuthConfig, MetabaseTheme } from "embedding-sdk";
import { MetabaseProviderInternal } from "embedding-sdk/components/public/MetabaseProvider";
import "metabase/css/index.module.css";
import "metabase/css/vendor.css";
import type { SdkStoreState } from "embedding-sdk/store/types";
import { useStore } from "metabase/lib/redux";
import { setIsEmbeddingSdk } from "metabase/redux/embed";

import S from "./SdkInteractiveEmbedProvider.module.css";

export interface SdkInteractiveEmbedProviderProps {
  children: ReactNode;
  authConfig: MetabaseAuthConfig;
  theme?: MetabaseTheme;
  locale?: string;
}

type StoreWithSdkState = Store<SdkStoreState, Action>;

/**
 * Provider for embedding the SDK in an iframe.
 * This is built on top of the internal `MetabaseProvider` component.
 */
export const SdkInteractiveEmbedProvider = ({
  children,
  authConfig,
  theme,
  locale,
}: SdkInteractiveEmbedProviderProps): JSX.Element => {
  const store = useStore();

  // Define that we are embedding the SDK in an iframe
  useEffect(() => {
    store.dispatch(setIsEmbeddingSdk(true));
  }, [store]);

  return (
    <MetabaseProviderInternal
      authConfig={authConfig}
      theme={theme}
      locale={locale}
      store={store as StoreWithSdkState}
      classNames={{ portalContainer: S.InteractiveEmbeddingPortalContainer }}
    >
      {children}
    </MetabaseProviderInternal>
  );
};
