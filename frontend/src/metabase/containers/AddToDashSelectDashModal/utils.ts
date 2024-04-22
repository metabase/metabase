import {
  coerceCollectionId,
  isPublicCollection,
} from "metabase/collections/utils";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { Collection, CollectionId, Dashboard } from "metabase-types/api";

interface GetInitialOpenCollectionIdProps {
  questionCollection: Pick<Collection, "id" | "is_personal">;
  mostRecentlyViewedDashboard: Dashboard | undefined;
}

export const getInitialOpenCollectionId = ({
  questionCollection,
  mostRecentlyViewedDashboard,
}: GetInitialOpenCollectionIdProps): undefined | CollectionId => {
  if (!mostRecentlyViewedDashboard) {
    return undefined;
  }

  if (
    questionCollection?.is_personal &&
    isInPublicCollection(mostRecentlyViewedDashboard)
  ) {
    return coerceCollectionId(questionCollection.id ?? ROOT_COLLECTION.id);
  }

  return coerceCollectionId(mostRecentlyViewedDashboard.collection_id);
};

export function isInPublicCollection(dashboard: Dashboard | undefined) {
  return isPublicCollection(dashboard?.collection ?? ROOT_COLLECTION);
}
