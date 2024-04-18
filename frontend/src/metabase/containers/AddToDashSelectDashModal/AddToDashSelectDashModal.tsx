import { useState } from "react";
import { t } from "ttag";

import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import { useCollectionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { Card, CollectionId, Dashboard } from "metabase-types/api";

import { useMostRecentlyViewedDashboard } from "./hooks";
import { getInitialOpenCollectionId } from "./utils";

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
  const mostRecentlyViewedDashboardQuery = useMostRecentlyViewedDashboard();
  const mostRecentlyViewedDashboard = mostRecentlyViewedDashboardQuery.data;
  const questionCollection = card.collection ?? ROOT_COLLECTION;
  const isQuestionInPersonalCollection = Boolean(
    questionCollection.is_personal,
  );
  const initialOpenCollectionId = getInitialOpenCollectionId({
    isQuestionInPersonalCollection,
    mostRecentlyViewedDashboard,
  });
  // when collectionId is null and loading is completed, show root collection
  // as user didn't visit any dashboard last 24hrs
  const collectionQuery = useCollectionQuery({
    id: initialOpenCollectionId,
    enabled: initialOpenCollectionId !== undefined,
  });

  const [openCollectionId] = useState<CollectionId | undefined>();
  const openCollection = useSelector(state =>
    Collections.selectors.getObject(state, {
      entityId: openCollectionId,
    }),
  );

  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);
  const isOpenCollectionInPersonalCollection = openCollection?.is_personal;
  const showCreateNewDashboardOption =
    !isQuestionInPersonalCollection || isOpenCollectionInPersonalCollection;

  const navigateToDashboard = (dashboard: Pick<Dashboard, "id" | "name">) => {
    onChangeLocation(
      Urls.dashboard(dashboard, {
        editMode: true,
        addCardWithId: card.id,
      }),
    );
  };

  const onDashboardSelected = (
    selectedDashboard?: Pick<Dashboard, "id" | "name">,
  ) => {
    if (selectedDashboard?.id) {
      navigateToDashboard(selectedDashboard);
    }
  };

  const isLoading =
    mostRecentlyViewedDashboardQuery.isLoading || collectionQuery.isLoading;
  const error = mostRecentlyViewedDashboardQuery.error ?? collectionQuery.error;

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  //TODO:handle initial value for question in personal collection

  return (
    <DashboardPickerModal
      title={getTitle(card)}
      onChange={onDashboardSelected}
      onClose={onClose}
      value={
        mostRecentlyViewedDashboardQuery.data && !isQuestionInPersonalCollection
          ? {
              id: mostRecentlyViewedDashboardQuery.data?.id,
              model: "dashboard",
            }
          : isQuestionInPersonalCollection && userPersonalCollectionId
          ? {
              id: userPersonalCollectionId,
              model: "collection",
            }
          : undefined
      }
      options={{
        allowCreateNew: showCreateNewDashboardOption,
        showPersonalCollections: isQuestionInPersonalCollection,
        showRootCollection: !isQuestionInPersonalCollection,
      }}
    />
  );
};
