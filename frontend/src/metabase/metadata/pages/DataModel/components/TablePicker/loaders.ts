import { useCallback } from "react";

import { useLazyListCollectionItemsQuery } from "metabase/api";
import type { ListCollectionItemsRequest } from "metabase-types/api";

export const useLazyFetchCollectionChildrenQuery = () => {
  const [trigger, data] = useLazyListCollectionItemsQuery();

  const triggerWithParams = useCallback(
    (opts: Partial<ListCollectionItemsRequest>, preferCacheValue?: boolean) => {
      return trigger(
        {
          ...opts,
          models: ["dataset", "collection"],
        },
        preferCacheValue,
      );
    },
    [trigger],
  );

  return [triggerWithParams, data];
};
