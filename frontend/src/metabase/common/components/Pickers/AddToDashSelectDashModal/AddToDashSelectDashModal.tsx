import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useGetMostRecentlyViewedDashboardQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  isLibraryCollection,
  isLibraryDashboard,
} from "metabase/common/collections/utils";
import { canPlaceEntityInCollectionOrDescendants } from "metabase/common/data-studio/collection-utils";
import { getUserPersonalCollectionId } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { Card, Dashboard } from "metabase-types/api";

import { DashboardPickerModal } from "../DashboardPicker";
import { type OmniPickerItem, isInCollectionTree } from "../EntityPicker";
import { getCollectionType } from "../EntityPicker/utils";

import { isInLibrary, isInPersonalCollection } from "./utils";

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
    useGetMostRecentlyViewedDashboardQuery();

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
  // library dashboards may only reference library questions
  const isLibraryQuestion =
    card.collection != null && isLibraryCollection(card.collection);
  const isRecentDashboardAllowed =
    isLibraryQuestion ||
    mostRecentlyViewedDashboard == null ||
    !isLibraryDashboard(mostRecentlyViewedDashboard);

  const showRecentDashboard =
    mostRecentlyViewedDashboard?.id &&
    isRecentDashboardAllowed &&
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
      if (!isInCollectionTree(item)) {
        return true;
      }

      if (item.model === "dashboard" && !item.can_write) {
        return true;
      }

      if (!isLibraryQuestion && isInLibrary(item)) {
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
    [isQuestionInPersonalCollection, isLibraryQuestion, personalCollectionId],
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
        getItemTooltip: (item) =>
          !isLibraryQuestion && isInLibrary(item)
            ? t`Only Library questions can be added to Library dashboards`
            : undefined,
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
