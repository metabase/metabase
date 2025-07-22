import { useMemo } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

import { MetabaseProviderStore } from "embedding-sdk/sdk-shared/lib/metabase-provider-store";

export const useMetabaseProviderStore = () => {
  const metabaseProviderStore = MetabaseProviderStore.getInstance();

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

  return metabaseProviderStore && props
    ? {
        sdkStore: metabaseProviderStore.getSdkStore(),
        props,
        updateProps: metabaseProviderStore.updateProps,
        update: metabaseProviderStore.update,
      }
    : null;
};
