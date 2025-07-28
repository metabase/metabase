import { type ReactNode, useEffect, useState } from "react";

import {
  type MetabaseProviderPropsStoreExternalProps,
  type MetabaseProviderPropsStoreInternalProps,
  ensureMetabaseProviderPropsStore,
} from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

type Props = {
  className?: string;
  reduxStore?: MetabaseProviderPropsStoreInternalProps["reduxStore"] | null;
  props: MetabaseProviderPropsStoreExternalProps;
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

  useEffect(() => {
    incrementProvidersCount();

    if (shouldInitialize()) {
      ensureMetabaseProviderPropsStore(props);
    } else {
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
    // eslint-disable-next-line -- Run on mount only
  }, []);

  useEffect(() => {
    if (reduxStore && !initialized) {
      ensureMetabaseProviderPropsStore().setProps({ reduxStore });

      // Now the `MetabaseProviderPropsStore` store is initialized and the `reduxStore` prop is set in it
      setInitialized(true);
    }
  }, [reduxStore, initialized]);

  useEffect(() => {
    ensureMetabaseProviderPropsStore().setProps(props);
  }, [props]);

  return <>{children({ initialized })}</>;
}
