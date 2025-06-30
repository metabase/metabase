import type { Action, Store } from "@reduxjs/toolkit";
import { type PropsWithChildren, useEffect, useRef } from "react";

import { useMetabaseProviderStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-store";
import {
  type MetabaseProviderPropsToStore,
  MetabaseProviderStore,
} from "embedding-sdk/sdk-shared/lib/metabase-provider-store";
import type { SdkStoreState } from "embedding-sdk/store/types";

type Props = {
  className?: string;
  store: Store<SdkStoreState, Action> | undefined;
  props: MetabaseProviderPropsToStore;
};

export const MetabaseProviderInner = ({
  children,
  store,
  props,
}: PropsWithChildren<Props>) => {
  const metabaseProviderStore = useMetabaseProviderStore();
  const existingStore = metabaseProviderStore?.sdkStore;

  // This makes the store stable across re-renders, but still not a singleton:
  // we need a different store for each test or each storybook story
  const initialized = useRef<boolean>(false);
  const sdkStoreRef = useRef<Store<SdkStoreState, Action> | null>(null);

  const areMultipleMetabaseProvidersUsed =
    !initialized.current && !!metabaseProviderStore;

  if (areMultipleMetabaseProvidersUsed) {
    console.warn(
      // eslint-disable-next-line no-literal-metabase-strings -- error message
      "Multiple instances of MetabaseProvider detected. Metabase Embedding SDK may work unexpectedly. Ensure only one instance of MetabaseProvider is rendered at a time.",
    );
  }

  if (!sdkStoreRef.current) {
    MetabaseProviderStore.initialize(props);
  }

  useEffect(() => {
    MetabaseProviderStore.getInstance()?.updateProps(props);
  }, [props]);

  useEffect(() => {
    initialized.current = true;

    return () => {
      MetabaseProviderStore.cleanup();
    };
  }, []);

  if (!sdkStoreRef.current && !existingStore && store) {
    sdkStoreRef.current = store;

    MetabaseProviderStore.getInstance()?.setSdkStore(sdkStoreRef.current);
  }

  return children;
};
