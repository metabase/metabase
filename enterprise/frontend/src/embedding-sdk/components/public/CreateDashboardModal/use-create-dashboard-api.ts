import { useCallback } from "react";

import { useSdkStore } from "embedding-sdk/store";
import {
  type SDKCollectionReference,
  getCollectionNumericIdFromReference,
} from "embedding-sdk/store/collections";
import { useCreateDashboardMutation } from "metabase/api";
import type { CreateDashboardProperties } from "metabase/dashboard/containers/CreateDashboardForm";

export interface CreateDashboardValues
  extends Omit<CreateDashboardProperties, "collection_id"> {
  collectionId: SDKCollectionReference;
}

export const useCreateDashboardApi = () => {
  const store = useSdkStore();

  const [createDashboard] = useCreateDashboardMutation();

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
    createDashboard: handleCreateDashboard,
  };
};
