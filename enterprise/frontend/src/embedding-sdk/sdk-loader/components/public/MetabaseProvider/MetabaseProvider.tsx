import type { Action, Store } from "@reduxjs/toolkit";
import { useEffect, useRef } from "react";

import type { MetabaseProviderProps } from "embedding-sdk/components/public";
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

  const { isLoading } = useWaitForSdkBundle();

  const Component = isLoading
    ? null
    : window.MetabaseEmbeddingSDK?.MetabaseProvider;

  useEffect(() => () => MetabaseProviderStore.cleanup(), []);

  if (!Component) {
    return <>{props.children}</>;
  }

  if (!storeRef.current && window.MetabaseEmbeddingSDK?.getSdkStore) {
    MetabaseProviderStore.getInstance()?.setSdkStore(
      window.MetabaseEmbeddingSDK.getSdkStore(),
    );
  }

  return <Component {...props} />;
};
