import type { Action, Store } from "@reduxjs/toolkit";
import { type PropsWithChildren, useEffect, useRef } from "react";

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
  const existingMetabaseProviderStoreRef = useRef(
    MetabaseProviderStore.getInstance(),
  );

  const initializedRef = useRef<boolean>(false);
  const sdkStoreInitializedRef = useRef<boolean>(false);

  if (!initializedRef.current) {
    if (existingMetabaseProviderStoreRef.current) {
      console.warn(
        // eslint-disable-next-line no-literal-metabase-strings -- error message
        "Multiple instances of MetabaseProvider detected. Metabase Embedding SDK may work unexpectedly. Ensure only one instance of MetabaseProvider is rendered at a time.",
      );
    } else {
      MetabaseProviderStore.initialize(props);
      initializedRef.current = true;
    }
  }

  if (
    !sdkStoreInitializedRef.current &&
    !existingMetabaseProviderStoreRef.current &&
    store
  ) {
    MetabaseProviderStore.getInstance()?.setSdkStore(store);
    sdkStoreInitializedRef.current = true;
  }

  useEffect(() => {
    MetabaseProviderStore.getInstance()?.updateProps(props);
  }, [props]);

  useEffect(
    () => () => {
      MetabaseProviderStore.cleanup();
    },
    [],
  );

  return children;
};
