import { isRootTrashCollection } from "metabase/common/collections/utils";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { Collection, CollectionItemModel } from "metabase-types/api";

import { ALL_MODELS } from "./constants";

type CollectionItemsScopeOptions = {
  models?: CollectionItemModel[];
  showDashboardQuestions?: boolean;
};

export const getCollectionItemsScope = (
  collection: Collection | undefined,
  {
    models = ALL_MODELS,
    showDashboardQuestions = true,
  }: CollectionItemsScopeOptions = {},
) => ({
  models,
  // Dashboard questions are only ever listed in the SDK and in the trash.
  "show-dashboard-questions":
    (isEmbeddingSdk() || isRootTrashCollection(collection)) &&
    showDashboardQuestions,
});
