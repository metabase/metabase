import { useCallback } from "react";
import { t } from "ttag";

import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { Card, Dashboard, RecentItem } from "metabase-types/api";

import { useMostRecentlyViewedDashboard } from "./hooks";
import {
  filterPersonalRecents,
  filterWritableDashboards,
  filterWritableRecents,
  shouldDisableItem,
} from "./utils";

const getTitle = ({ type }: Card) => {
  if (type === "model") {
    return t`Add this model to a dashboard`;
  }

  if (type === "metric") {
    return t`Add this metric to a dashboard`;
  }

  if (type === "question") {
    return t`Add this question to a dashboard`;
  }

  throw new Error(`Unknown card.type: ${type}`);
};

interface AddToDashSelectDashModalProps {
  card: Card;
  onChangeLocation: (location: string) => void;
  onClose: () => void;
}

export const AddToDashSelectDashModal = ({
  card,
  onClose,
  onChangeLocation,
}: AddToDashSelectDashModalProps) => {
  const personalCollectionId = useSelector(getUserPersonalCollectionId);

  const {
    data: mostRecentlyViewedDashboard,
    isLoading,
    error,
  } = useMostRecentlyViewedDashboard();

  const onDashboardSelected = (
    selectedDashboard?: Pick<Dashboard, "id" | "name">,
  ) => {
    if (selectedDashboard?.id) {
      onChangeLocation(
        Urls.dashboard(selectedDashboard, {
          editMode: true,
          addCardWithId: card.id,
        }),
      );
    }
  };

  const questionCollection = card.collection ?? ROOT_COLLECTION;
  const isQuestionInPersonalCollection = !!questionCollection.is_personal;
  const isRecentDashboardInPersonalCollection =
    mostRecentlyViewedDashboard?.collection?.is_personal;

  // we can only show the most recently viewed dashboard if it's not in a personal collection
  // OR the question and dashboard are both in personal collections
  const showRecentDashboard =
    mostRecentlyViewedDashboard?.id &&
    (!isQuestionInPersonalCollection || isRecentDashboardInPersonalCollection);

  const recentsFilter = useCallback(
    (items: RecentItem[]) => {
      const writableRecents = filterWritableRecents(items);

      if (isQuestionInPersonalCollection && personalCollectionId) {
        return filterPersonalRecents(writableRecents, personalCollectionId);
      } else {
        return writableRecents;
      }
    },
    [isQuestionInPersonalCollection, personalCollectionId],
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <DashboardPickerModal
      title={getTitle(card)}
      onChange={onDashboardSelected}
      onClose={onClose}
      value={
        showRecentDashboard
          ? {
              id: mostRecentlyViewedDashboard.id,
              model: "dashboard",
            }
          : {
              id: card.collection_id ?? "root",
              model: "collection",
            }
      }
      options={{
        allowCreateNew: true,
        showPersonalCollections: true,
        showRootCollection: !isQuestionInPersonalCollection,
      }}
      shouldDisableItem={shouldDisableItem}
      searchFilter={filterWritableDashboards}
      recentFilter={recentsFilter}
    />
  );
};
