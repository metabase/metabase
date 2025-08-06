import { useCallback, useMemo } from "react";

import { useLazySelector } from "embedding-sdk/sdk-package/hooks/private/use-lazy-selector";
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
  const { props } = useMetabaseProviderPropsStore();
  const { reduxStore } = props;

  const loginStatus = useLazySelector((state) => state.sdk.loginStatus);

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
        getWindow()?.MetabaseEmbeddingSDK?.createDashboard;
      const getCollectionNumericIdFromReference =
        getWindow()?.MetabaseEmbeddingSDK?.getCollectionNumericIdFromReference;

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
