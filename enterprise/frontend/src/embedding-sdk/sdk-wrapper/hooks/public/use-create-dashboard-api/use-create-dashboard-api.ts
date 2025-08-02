import { useCallback } from "react";

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

  return reduxStore
    ? {
        /**
         * @param options
         */
        createDashboard: handleCreateDashboard,
      }
    : null;
};
