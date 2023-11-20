import type { CollectionId, Dashboard } from "metabase-types/api";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  coerceCollectionId,
  isPublicCollection,
} from "metabase/collections/utils";

interface GetInitialOpenCollectionIdProps {
  isQuestionInPersonalCollection: boolean;
  mostRecentlyViewedDashboard: Dashboard | undefined;
}

export const getInitialOpenCollectionId = ({
  isQuestionInPersonalCollection,
  mostRecentlyViewedDashboard,
}: GetInitialOpenCollectionIdProps): undefined | CollectionId => {
  if (!mostRecentlyViewedDashboard) {
    return undefined;
  }

  if (
    isQuestionInPersonalCollection &&
    isInPublicCollection(mostRecentlyViewedDashboard)
  ) {
    return ROOT_COLLECTION.id;
  }

  return coerceCollectionId(mostRecentlyViewedDashboard.collection_id);
};

export function isInPublicCollection(dashboard: Dashboard | undefined) {
  return isPublicCollection(dashboard?.collection ?? ROOT_COLLECTION);
}
