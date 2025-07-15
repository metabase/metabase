import { useEffect, useMemo } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import {
  type MetabaseProviderPropsStoreExternalProps,
  type MetabaseProviderPropsStoreInternalProps,
  ensureMetabaseProviderPropsStore,
} from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

const incrementProvidersCount = () => {
  window.METABASE_PROVIDERS_COUNT = (window.METABASE_PROVIDERS_COUNT ?? 0) + 1;
};

const decrementProvidersCount = () => {
  window.METABASE_PROVIDERS_COUNT = Math.max(
    0,
    (window.METABASE_PROVIDERS_COUNT ?? 1) - 1,
  );
};

const alreadyInitialized = () => {
  return (getWindow()?.METABASE_PROVIDERS_COUNT ?? 0) > 1;
};

const shouldCleanup = () => {
  return (getWindow()?.METABASE_PROVIDERS_COUNT ?? 0) === 0;
};

export const useInitializeMetabaseProviderPropsStore = (
  initialProps: MetabaseProviderPropsStoreExternalProps,
  reduxStore?: MetabaseProviderPropsStoreInternalProps["reduxStore"] | null,
) => {
  // Initialize the store once, it's done during the first render to be sure that all other
  // `ensureMetabaseProviderPropsStore` and `useMetabaseProviderPropsStore` calls are performed over the initialized store.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => ensureMetabaseProviderPropsStore(initialProps), []);

  const { initialized = false } = useMetabaseProviderPropsStore();

  useEffect(() => {
    incrementProvidersCount();

    if (alreadyInitialized()) {
      console.warn(
        // eslint-disable-next-line no-literal-metabase-strings -- Warning message
        "Multiple instances of MetabaseProvider detected. Metabase Embedding SDK may work unexpectedly. Ensure only one instance of MetabaseProvider is rendered at a time.",
      );
    }

    return () => {
      decrementProvidersCount();

      if (shouldCleanup()) {
        ensureMetabaseProviderPropsStore().cleanup();
      }
    };
  }, []);

  useEffect(() => {
    if (reduxStore && !initialized) {
      ensureMetabaseProviderPropsStore().updateInternalProps({
        reduxStore,
        initialized: true,
      });
    }
  }, [reduxStore, initialized]);

  return {
    initialized,
  };
};
