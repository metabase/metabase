import type { CreateDashboardValues, MetabaseDashboard } from "embedding-sdk";
import { getCollectionNumericIdFromReference } from "embedding-sdk/store/collections";
import type { SdkStore } from "embedding-sdk/store/types";
import { createDashboard as createDashboardMutation } from "metabase/api/dashboard";

export const createDashboard =
  (reduxStore: SdkStore) =>
  async ({
    collectionId = "personal",
    ...rest
  }: CreateDashboardValues): Promise<MetabaseDashboard> => {
    const realCollectionId = getCollectionNumericIdFromReference(
      reduxStore.getState(),
      collectionId,
    );

    const action = createDashboardMutation.initiate({
      ...rest,
      collection_id: realCollectionId,
    });

    return reduxStore.dispatch(action).unwrap();
  };
