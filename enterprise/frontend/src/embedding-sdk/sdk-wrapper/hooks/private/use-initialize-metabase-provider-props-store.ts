import { useEffect, useMemo } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import {
  type MetabaseProviderPropsStoreExternalProps,
  type MetabaseProviderPropsStoreInternalProps,
  ensureMetabaseProviderPropsStore,
} from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";

export const useInitializeMetabaseProviderPropsStore = (
  initialProps: MetabaseProviderPropsStoreExternalProps,
  reduxStore?: MetabaseProviderPropsStoreInternalProps["reduxStore"] | null,
) => {
  // Initialize the store once, it's done during the first render to be sure that all other
  // `ensureMetabaseProviderPropsStore` and `useMetabaseProviderPropsStore` calls are performed over the initialized store.
  useMemo(
    () => ensureMetabaseProviderPropsStore().initialize(initialProps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const {
    props: { initialized = false },
  } = useMetabaseProviderPropsStore();

  useEffect(function cleanupMetabaseProviderPropsStore() {
    return () => {
      ensureMetabaseProviderPropsStore().cleanup();
    };
  }, []);

  useEffect(
    function initializeReduxStore() {
      if (reduxStore && !initialized) {
        ensureMetabaseProviderPropsStore().updateInternalProps({
          reduxStore,
          initialized: true,
        });
      }
    },
    [reduxStore, initialized],
  );

  return {
    initialized,
  };
};
