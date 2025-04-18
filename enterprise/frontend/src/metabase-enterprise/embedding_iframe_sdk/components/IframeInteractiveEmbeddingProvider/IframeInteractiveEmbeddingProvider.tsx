import type { Action, Store } from "@reduxjs/toolkit";
import { type ReactNode, useEffect } from "react";

import type { MetabaseAuthConfig, MetabaseTheme } from "embedding-sdk";
import { MetabaseProviderInternal } from "embedding-sdk/components/public/MetabaseProvider";
import "metabase/css/index.module.css";
import "metabase/css/vendor.css";
import type { SdkStoreState } from "embedding-sdk/store/types";
import { useStore } from "metabase/lib/redux";
import { setIsEmbeddingSdk } from "metabase/redux/embed";

import S from "./IframeInteractiveEmbeddingProvider.module.css";

/**
 * @expand
 * @category MetabaseProvider
 */
export interface MetabaseProviderProps {
  /**
   * The children of the MetabaseProvider component.
   */
  children: ReactNode;

  /**
   * Defines how to authenticate with Metabase.
   */
  authConfig: MetabaseAuthConfig;

  /**
   * See [Appearance](https://www.metabase.com/docs/latest/embedding/sdk/appearance).
   */
  theme?: MetabaseTheme;

  /**
   * Defines the display language. Accepts an ISO language code such as `en` or `de`.
   * Defaults to the instance locale.
   **/
  locale?: string;
}

type StoreWithSdkState = Store<SdkStoreState, Action>;

export const IframeInteractiveEmbeddingProvider = ({
  children,
  authConfig,
  theme,
  locale,
}: MetabaseProviderProps): JSX.Element => {
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
