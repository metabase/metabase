import { useCallback } from "react";

import { useSdkStore } from "embedding-sdk/store";
import { useCreateDashboardMutation } from "metabase/api";
import type { CreateDashboardProperties } from "metabase/dashboard/containers/CreateDashboardForm";
import Collections from "metabase/entities/collections";
import type { CollectionId } from "metabase-types/api";

export interface CreateDashboardValues
  extends Omit<CreateDashboardProperties, "collection_id"> {
  collectionId: CollectionId | null;
}

export const useCreateDashboardApi = () => {
  const store = useSdkStore();

  const [createDashboard] = useCreateDashboardMutation();

  const handleCreateDashboard = useCallback(
    async (values: CreateDashboardValues) => {
      const initialCollectionId = Collections.selectors.getInitialCollectionId(
        store.getState(),
        values,
      ) as CollectionId;

      return createDashboard({
        ...values,
        collection_id: values.collectionId ?? initialCollectionId,
      }).unwrap();
    },
    [createDashboard, store],
  );

  return {
    createDashboard: handleCreateDashboard,
  };
};
