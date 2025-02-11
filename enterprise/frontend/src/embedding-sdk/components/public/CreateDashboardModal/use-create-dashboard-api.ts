import { useCallback } from "react";

import { useSdkStore } from "embedding-sdk/store";
import {
  type SDKCollectionId,
  getNumericCollectionId,
} from "embedding-sdk/store/collections";
import { useCreateDashboardMutation } from "metabase/api";
import type { CreateDashboardProperties } from "metabase/dashboard/containers/CreateDashboardForm";

export interface CreateDashboardValues
  extends Omit<CreateDashboardProperties, "collection_id"> {
  collectionId: SDKCollectionId | null;
}

export const useCreateDashboardApi = () => {
  const store = useSdkStore();

  const [createDashboard] = useCreateDashboardMutation();

  const handleCreateDashboard = useCallback(
    async (values: CreateDashboardValues) => {
      const { collectionId, ...rest } = values;
      const numericCollectionId = getNumericCollectionId(
        store.getState(),
        collectionId,
      );

      return createDashboard({
        ...rest,
        collection_id: numericCollectionId,
      }).unwrap();
    },
    [createDashboard, store],
  );

  return {
    createDashboard: handleCreateDashboard,
  };
};
