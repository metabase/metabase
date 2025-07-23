import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import {
  MetabaseProviderPropsStore,
  type MetabaseProviderPropsToStore,
} from "embedding-sdk/sdk-shared/lib/metabase-provider-props-store";

type Props = {
  className?: string;
  reduxStore?: MetabaseProviderPropsToStore["reduxStore"] | null;
  props: Omit<MetabaseProviderPropsToStore, "reduxStore">;
  children: (state: { initialized: boolean }) => ReactNode;
};

const incrementProvidersCount = () => {
  window.METABASE_PROVIDERS_COUNT = (window.METABASE_PROVIDERS_COUNT ?? 0) + 1;
};

const decrementProvidersCount = () => {
  window.METABASE_PROVIDERS_COUNT = Math.max(
    0,
    (window.METABASE_PROVIDERS_COUNT ?? 1) - 1,
  );
};

const shouldInitialize = () => {
  return (getWindow()?.METABASE_PROVIDERS_COUNT ?? 0) <= 1;
};

const shouldCleanup = () => {
  return (getWindow()?.METABASE_PROVIDERS_COUNT ?? 0) === 0;
};

export function MetabaseProviderInner({ reduxStore, props, children }: Props) {
  const [initialized, setInitialized] = useState(false);
  const [reduxStoreInitialized, setReduxStoreInitialized] = useState(false);

  useEffect(() => {
    incrementProvidersCount();

    if (shouldInitialize()) {
      MetabaseProviderPropsStore.initialize(props);
    } else {
      console.warn(
        // eslint-disable-next-line no-literal-metabase-strings -- Warning message
        "Multiple instances of MetabaseProvider detected. Metabase Embedding SDK may work unexpectedly. Ensure only one instance of MetabaseProvider is rendered at a time.",
      );
    }

    setInitialized(true);

    return () => {
      decrementProvidersCount();

      if (shouldCleanup()) {
        MetabaseProviderPropsStore.cleanup();
      }
    };
    // eslint-disable-next-line -- Run on mount only
  }, []);

  useEffect(() => {
    if (reduxStore && !reduxStoreInitialized) {
      MetabaseProviderPropsStore.getInstance()?.setReduxStore(reduxStore);
      setReduxStoreInitialized(true);
    }
  }, [reduxStore, reduxStoreInitialized]);

  useEffect(() => {
    MetabaseProviderPropsStore.getInstance()?.updateProps(props);
  }, [props]);

  return <>{children({ initialized: initialized && reduxStoreInitialized })}</>;
}
