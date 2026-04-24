import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  type OmniPickerItem,
  isInDbTree,
} from "metabase/common/components/Pickers";
import { DashboardPickerModal } from "metabase/common/components/Pickers/DashboardPicker";
import { getCollectionType } from "metabase/common/components/Pickers/EntityPicker/utils";
import { canPlaceEntityInCollectionOrDescendants } from "metabase/data-studio/utils";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { useSelector } from "metabase/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import * as Urls from "metabase/urls";
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
  const { data: mostRecentlyViewedDashboard } =
    useMostRecentlyViewedDashboard();

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

  const showRecentDashboard =
    mostRecentlyViewedDashboard?.id &&
    (!isQuestionInPersonalCollection || isRecentDashboardInPersonalCollection);

  const value = useMemo(() => {
    if (showRecentDashboard) {
      return {
        id: mostRecentlyViewedDashboard.id,
        model: "dashboard" as const,
      };
    }
    return {
      id: card.collection_id ?? "root",
      model: "collection" as const,
    };
  }, [
    showRecentDashboard,
    mostRecentlyViewedDashboard?.id,
    card.collection_id,
  ]);

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
        const isPersonalDash = isInPersonalCollection(
          item,
          personalCollectionId,
        );

        return !isPersonalDash;
      }

      if (
        !canPlaceEntityInCollectionOrDescendants(
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

  return (
    <DashboardPickerModal
      title={getTitle(card)}
      onChange={onDashboardSelected}
      onClose={onClose}
      value={value}
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
