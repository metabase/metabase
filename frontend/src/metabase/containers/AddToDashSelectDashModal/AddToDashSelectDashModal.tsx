import { useState } from "react";
import { t } from "ttag";

import { useCollectionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Card, CollectionId, Dashboard, DashboardId } from "metabase-types/api";

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
  dashboards: Record<string, Dashboard>;
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

  const [openCollectionId, setOpenCollectionId] = useState<
    CollectionId | undefined
  >();
  const openCollection = useSelector(state =>
    Collections.selectors.getObject(state, {
      entityId: openCollectionId,
    }),
  );
  const isOpenCollectionInPersonalCollection = openCollection?.is_personal;
  const showCreateNewDashboardOption =
    !isQuestionInPersonalCollection || isOpenCollectionInPersonalCollection;

  const navigateToDashboard =
    (dashboard: Pick<Dashboard, "id"|"name">) => {
      onChangeLocation(
        Urls.dashboard(dashboard, {
          editMode: true,
          addCardWithId: card.id,
        }),
      );
    };

  const onDashboardSelected = (selectedDashboard?: Pick<Dashboard, "id"|"name">)=> {
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

  return (
    <DashboardPickerModal
      title={getTitle(card)}
      onChange={onDashboardSelected}
      onClose={onClose}
      value={mostRecentlyViewedDashboardQuery.data ? {
        id: mostRecentlyViewedDashboardQuery.data?.id,
        model: "dashboard",
      }:undefined}
      options={{
        allowCreateNew: showCreateNewDashboardOption,
        showPersonalCollections: isQuestionInPersonalCollection,
      }}
    />
    // <ModalContent
    //   id="AddToDashSelectDashModal"
    //   title={getTitle(card)}
    //   onClose={onClose}
    // >
    //   <DashboardPicker
    //     onOpenCollectionChange={setOpenCollectionId}
    //     filterPersonalCollections={
    //       isQuestionInPersonalCollection ? "only" : undefined
    //     }
    //     onChange={onDashboardSelected}
    //     collectionId={initialOpenCollectionId}
    //     value={mostRecentlyViewedDashboardQuery.data?.id}
    //   />
    //   {showCreateNewDashboardOption && (
    //     <Link onClick={() => setShouldCreateDashboard(true)} to="">
    //       <LinkContent>
    //         <Icon name="add" className={CS.mx1} />
    //         <h4>{t`Create a new dashboard`}</h4>
    //       </LinkContent>
    //     </Link>
    //   )}
    // </ModalContent>
  );
};
