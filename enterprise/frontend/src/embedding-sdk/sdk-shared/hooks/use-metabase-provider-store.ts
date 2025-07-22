import { useCallback, useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

import { MetabaseProviderStore } from "embedding-sdk/sdk-shared/lib/metabase-provider-store";
import { METABASE_PROVIDER_STORE_INITIALIZATION_EVENT_NAME } from "embedding-sdk/sdk-wrapper/config";
import type { MetabaseProviderStoreInitializationEvent } from "embedding-sdk/sdk-wrapper/types/sdk-store";

export const useMetabaseProviderStore = () => {
  const [metabaseProviderStore, setMetabaseProviderStore] =
    useState<MetabaseProviderStore | null>(MetabaseProviderStore.getInstance());

  const handleMetabaseProviderStoreInitializationEvent = useCallback(
    (event: Event) => {
      const customEvent =
        event as CustomEvent<MetabaseProviderStoreInitializationEvent>;

      if (customEvent.detail.status) {
        setMetabaseProviderStore(MetabaseProviderStore.getInstance());
      }
    },
    [],
  );

  useEffect(() => {
    document.addEventListener(
      METABASE_PROVIDER_STORE_INITIALIZATION_EVENT_NAME,
      handleMetabaseProviderStoreInitializationEvent,
    );

    return () => {
      document.removeEventListener(
        METABASE_PROVIDER_STORE_INITIALIZATION_EVENT_NAME,
        handleMetabaseProviderStoreInitializationEvent,
      );
    };
  }, [handleMetabaseProviderStoreInitializationEvent]);

  const subscribe = useMemo(() => {
    if (!metabaseProviderStore) {
      return () => () => {};
    }

    return metabaseProviderStore.subscribe;
  }, [metabaseProviderStore]);

  const getSnapshot = useMemo(() => {
    if (!metabaseProviderStore) {
      return () => null;
    }

    return metabaseProviderStore.getSnapshot;
  }, [metabaseProviderStore]);

  const props = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return metabaseProviderStore && props ? props : null;
};
