import { t } from "ttag";

import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import * as Urls from "metabase/lib/urls";
import type { Card, Dashboard } from "metabase-types/api";

import { useMostRecentlyViewedDashboard } from "./hooks";
import {
  shouldDisableItem,
  filterWritableDashboards,
  filterWritableRecents,
} from "./utils";

const getTitle = ({ type }: Card) => {
  if (type === "model") {
    return t`Add this model to a dashboard`;
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

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const questionCollection = card.collection ?? ROOT_COLLECTION;
  const isQuestionInPersonalCollection = !!questionCollection.is_personal;
  const isRecentDashboardInPersonalCollection =
    mostRecentlyViewedDashboard?.collection?.is_personal;

  // we can only show the most recently viewed dashboard if it's not in a personal collection
  // OR the question and dashboard are both in personal collections
  const showRecentDashboard =
    mostRecentlyViewedDashboard?.id &&
    (!isQuestionInPersonalCollection || isRecentDashboardInPersonalCollection);

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
      recentFilter={filterWritableRecents}
    />
  );
};
