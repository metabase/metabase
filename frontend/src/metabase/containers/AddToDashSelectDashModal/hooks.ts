import { useAsync } from "react-use";
import type { CollectionId, Dashboard } from "metabase-types/api";
import { ActivityApi } from "metabase/services";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { coerceCollectionId } from "metabase/collections/utils";

export const useMostRecentlyViewedDashboard = () => {
  const {
    loading: isLoading,
    error,
    value: data,
  } = useAsync(async () => {
    const dashboard: Dashboard | undefined =
      await ActivityApi.most_recently_viewed_dashboard();

    return dashboard;
  });

  return { data, isLoading, error };
};

interface UseCollectionIdProps {
  isQuestionInPersonalCollection: boolean;
  mostRecentlyViewedDashboard: Dashboard | undefined;
}

export const useCollectionId = ({
  isQuestionInPersonalCollection,
  mostRecentlyViewedDashboard,
}: UseCollectionIdProps): undefined | CollectionId => {
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

function isInPublicCollection(dashboard: Dashboard | undefined) {
  return !dashboard?.collection?.is_personal;
}
