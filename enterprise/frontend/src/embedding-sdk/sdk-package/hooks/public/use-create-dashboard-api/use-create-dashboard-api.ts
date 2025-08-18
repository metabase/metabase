import { useCallback, useMemo } from "react";

import { useLazySelector } from "embedding-sdk/sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import type {
  CreateDashboardValues,
  MetabaseDashboard,
} from "embedding-sdk/types/dashboard";

/**
 * Creates a dashboard.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useCreateDashboardApi
 */
export const useCreateDashboardApi = () => {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const loginStatus = useLazySelector(
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getLoginStatus,
  );

  /**
   * @function
   */
  const handleCreateDashboard = useCallback(
    async ({
      collectionId = "personal",
      ...rest
    }: CreateDashboardValues): Promise<MetabaseDashboard> => {
      if (!reduxStore) {
        throw new Error('Embedding SDK "reduxStore" is not available');
      }

      const createDashboard =
        getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.createDashboard;
      const getCollectionNumericIdFromReference =
        getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE
          ?.getCollectionNumericIdFromReference;

      if (!createDashboard || !getCollectionNumericIdFromReference) {
        throw new Error("Embedding SDK bundle is not initialized");
      }

      const realCollectionId = getCollectionNumericIdFromReference(
        reduxStore.getState(),
        collectionId,
      );

      const action = createDashboard.initiate({
        ...rest,
        collection_id: realCollectionId,
      });

      return reduxStore.dispatch(action).unwrap();
    },
    [reduxStore],
  );

  return useMemo(
    () =>
      // Until a user is authorized the `createDashboard` can't be called
      reduxStore && loginStatus?.status === "success"
        ? {
            /**
             * @param options
             */
            createDashboard: handleCreateDashboard,
          }
        : null,
    [handleCreateDashboard, loginStatus?.status, reduxStore],
  );
};
