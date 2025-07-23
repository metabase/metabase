import { useCallback, useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

import { MetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/metabase-provider-props-store";
import { METABASE_PROVIDER_PROPS_STORE_INIT_EVENT_NAME } from "embedding-sdk/sdk-wrapper/config";
import type { MetabaseProviderPropsStoreInitEvent } from "embedding-sdk/sdk-wrapper/types/sdk-store";

export const useMetabaseProviderPropsStore = () => {
  const [metabaseProviderPropsStore, setMetabaseProviderPropsStore] =
    useState<MetabaseProviderPropsStore | null>(
      MetabaseProviderPropsStore.getInstance(),
    );

  const handleEvent = useCallback((event: Event) => {
    const customEvent =
      event as CustomEvent<MetabaseProviderPropsStoreInitEvent>;

    if (customEvent.detail.status) {
      setMetabaseProviderPropsStore(MetabaseProviderPropsStore.getInstance());
    }
  }, []);

  useEffect(() => {
    document.addEventListener(
      METABASE_PROVIDER_PROPS_STORE_INIT_EVENT_NAME,
      handleEvent,
    );

    return () => {
      document.removeEventListener(
        METABASE_PROVIDER_PROPS_STORE_INIT_EVENT_NAME,
        handleEvent,
      );
    };
  }, [handleEvent]);

  const subscribe = useMemo(() => {
    if (!metabaseProviderPropsStore) {
      return () => () => {};
    }

    return metabaseProviderPropsStore.subscribe;
  }, [metabaseProviderPropsStore]);

  const getSnapshot = useMemo(() => {
    if (!metabaseProviderPropsStore) {
      return () => null;
    }

    return metabaseProviderPropsStore.getSnapshot;
  }, [metabaseProviderPropsStore]);

  const props = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return metabaseProviderPropsStore && props ? props : null;
};
