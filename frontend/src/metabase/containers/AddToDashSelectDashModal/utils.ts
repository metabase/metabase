import {
  coerceCollectionId,
  isPublicCollection,
} from "metabase/collections/utils";
import type { DashboardPickerItem } from "metabase/common/components/DashboardPicker";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { CollectionId, Dashboard } from "metabase-types/api";

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

export const shouldDisableItem = (item: DashboardPickerItem) => {
  return item.model === "dashboard" && item.can_write === false;
};

export const filterWritableDashboards = (
  dashes: DashboardPickerItem[],
): DashboardPickerItem[] => {
  return dashes.filter(dash => dash.can_write);
};
