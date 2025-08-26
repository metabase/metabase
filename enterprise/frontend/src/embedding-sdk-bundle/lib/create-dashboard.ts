import { getCollectionNumericIdFromReference } from "embedding-sdk-bundle/store/collections";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type {
  CreateDashboardValues,
  MetabaseDashboard,
} from "embedding-sdk-package";
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
