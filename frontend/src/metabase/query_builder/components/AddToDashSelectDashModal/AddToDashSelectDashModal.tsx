import { useCallback } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type OmniPickerItem,
  isInDbTree,
} from "metabase/common/components/Pickers";
import { DashboardPickerModal } from "metabase/common/components/Pickers/DashboardPicker";
import { getCollectionType } from "metabase/common/components/Pickers/EntityPicker/utils";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { Card, Dashboard } from "metabase-types/api";

import { useMostRecentlyViewedDashboard } from "./hooks";
import { isInPersonalCollection } from "./utils";

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

  const shouldDisable = useCallback(
    (item: OmniPickerItem) => {
      if (isInDbTree(item)) {
        return true;
      }

      if (item.model === "dashboard" && !item.can_write) {
        return true;
      }

      if (
        isQuestionInPersonalCollection &&
        personalCollectionId &&
        item.model === "dashboard"
      ) {
        // if the question is in a personal collection, hide dashboards that aren't in the personal collection
        const isPersonalDash = isInPersonalCollection(
          item,
          personalCollectionId,
        );

        return !isPersonalDash;
      }

      // if there can't be dashboards in the collection, you can't add a question to one there
      if (
        !PLUGIN_DATA_STUDIO.canPlaceEntityInCollectionOrDescendants(
          "dashboard",
          getCollectionType(item),
        )
      ) {
        return true;
      }

      return false;
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
        hasPersonalCollections: true,
        hasRootCollection: !isQuestionInPersonalCollection,
      }}
      searchParams={{
        filter_items_in_personal_collection: isQuestionInPersonalCollection
          ? "only"
          : undefined,
      }}
      namespaces={isQuestionInPersonalCollection ? [null] : undefined}
      isDisabledItem={shouldDisable}
    />
  );
};
