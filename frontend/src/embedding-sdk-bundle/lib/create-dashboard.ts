import { getCollectionIdValueFromReference } from "embedding-sdk-bundle/store/collections";
import { createDashboard as createDashboardMutation } from "metabase/api/dashboard";
import type { SdkStore } from "metabase/embedding/sdk-bundle/store-types";
import type {
  CreateDashboardValues,
  MetabaseDashboard,
} from "metabase/embedding/sdk-bundle/types";

export const createDashboard =
  (reduxStore: SdkStore) =>
  async ({
    collectionId = "personal",
    ...rest
  }: CreateDashboardValues): Promise<MetabaseDashboard> => {
    const realCollectionId = getCollectionIdValueFromReference(
      reduxStore.getState(),
      collectionId,
    );

    const action = createDashboardMutation.initiate({
      ...rest,
      collection_id: realCollectionId,
    });

    return reduxStore.dispatch(action).unwrap();
  };
