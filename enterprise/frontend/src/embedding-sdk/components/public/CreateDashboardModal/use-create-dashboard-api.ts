import { useCallback } from "react";

import { useSdkStore } from "embedding-sdk/store";
import { getCollectionNumericIdFromReference } from "embedding-sdk/store/collections";
import type { SdkCollectionId } from "embedding-sdk/types/collection";
import { useCreateDashboardMutation } from "metabase/api";
import type { CreateDashboardProperties } from "metabase/dashboard/containers/CreateDashboardForm";

export interface CreateDashboardValues
  extends Omit<CreateDashboardProperties, "collection_id"> {
  /**
   * Collection in which to create a new dashboard. You can use predefined system values like `root` or `personal`.
   */
  collectionId: SdkCollectionId;
}

/**
 * Creates a dashboard
 *
 * @function
 * @category CreateDashboardModal
 */
export const useCreateDashboardApi = () => {
  const store = useSdkStore();

  const [createDashboard] = useCreateDashboardMutation();

  /**
   * @function
   */
  const handleCreateDashboard = useCallback(
    async ({ collectionId = "personal", ...rest }: CreateDashboardValues) => {
      const realCollectionId = getCollectionNumericIdFromReference(
        store.getState(),
        collectionId,
      );

      return createDashboard({
        ...rest,
        collection_id: realCollectionId,
      }).unwrap();
    },
    [createDashboard, store],
  );

  return {
    /**
     * @param options
     */
    createDashboard: handleCreateDashboard,
  };
};
