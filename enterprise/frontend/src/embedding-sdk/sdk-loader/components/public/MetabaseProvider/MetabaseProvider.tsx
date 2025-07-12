import type { Action, Store } from "@reduxjs/toolkit";
import { useEffect, useRef } from "react";

import type { MetabaseProviderProps } from "embedding-sdk/components/public";
import { useLoadSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-load-sdk-bundle";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-wait-for-sdk-bundle";
import { MetabaseProviderStore } from "embedding-sdk/sdk-loader/lib/private/lazy-sdk-store";
import type { SdkStoreState } from "embedding-sdk/store/types";

/**
 * A component that provides the Metabase SDK context and theme.
 *
 * @function
 * @category MetabaseProvider
 */
export const MetabaseProvider = (props: MetabaseProviderProps) => {
  // This makes the store stable across re-renders, but still not a singleton:
  // we need a different store for each test or each storybook story
  const storeRef = useRef<Store<SdkStoreState, Action> | null>(null);

  if (!storeRef.current) {
    MetabaseProviderStore.initialize();
  }

  useLoadSdkBundle(props.authConfig.metabaseInstanceUrl);
  const { isLoading } = useWaitForSdkBundle();

  useEffect(() => {
    window.EMBEDDING_SDK_BUNDLE_LOADING = true;

    return () => {
      window.EMBEDDING_SDK_BUNDLE_LOADING = undefined;
      MetabaseProviderStore.cleanup();
    };
  }, []);

  const Component = isLoading
    ? null
    : window.MetabaseEmbeddingSDK?.MetabaseProvider;

  if (!Component) {
    return <>{props.children}</>;
  }

  if (!storeRef.current && window.MetabaseEmbeddingSDK?.getSdkStore) {
    storeRef.current = window.MetabaseEmbeddingSDK.getSdkStore();

    MetabaseProviderStore.getInstance()?.setSdkStore(storeRef.current);
  }

  return <Component {...props} />;
};
