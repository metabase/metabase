import { useCallback } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";

export const useSingleCopyWrapperIds = () => {
  const {
    store,
    props: { singleCopyWrapperIdsMap: singleCopyIdsMap },
  } = useMetabaseProviderPropsStore();

  const setSingleCopyIdsMap = useCallback(
    (
      updateFn: (
        singleCopyIdsMap: Record<string, string[]>,
      ) => Record<string, string[]>,
    ) => {
      const singleCopyWrapperIdsMap =
        store.getSnapshot().singleCopyWrapperIdsMap || {};

      store.updateInternalProps({
        singleCopyWrapperIdsMap: updateFn(singleCopyWrapperIdsMap),
      });
    },
    [store],
  );

  return { singleCopyIdsMap, setSingleCopyIdsMap };
};
