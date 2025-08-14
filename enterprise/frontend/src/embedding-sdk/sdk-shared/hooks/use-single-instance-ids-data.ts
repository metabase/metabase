import { useCallback } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";

export const useSingleInstanceIdsData = () => {
  const {
    store,
    props: { singleInstanceIdsMap },
  } = useMetabaseProviderPropsStore();

  const setSingleInstanceIdsMap = useCallback(
    (
      updateFn: (
        singleInstanceIdsMap: Record<string, string[]>,
      ) => Record<string, string[]>,
    ) => {
      const singleInstanceIdsMap =
        store.getSnapshot().singleInstanceIdsMap || {};

      store.updateInternalProps({
        singleInstanceIdsMap: updateFn(singleInstanceIdsMap),
      });
    },
    [store],
  );

  return { singleInstanceIdsMap, setSingleInstanceIdsMap };
};
