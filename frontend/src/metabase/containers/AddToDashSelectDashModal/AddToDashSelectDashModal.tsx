import type { ComponentPropsWithoutRef } from "react";
import { useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import Link from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";
import DashboardPicker from "metabase/containers/DashboardPicker";
import * as Urls from "metabase/lib/urls";
import { CreateDashboardModalConnected } from "metabase/dashboard/containers/CreateDashboardModal";
import { useCollectionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import type { State } from "metabase-types/store";
import type { Card, CollectionId, Dashboard } from "metabase-types/api";
import type { CreateDashboardFormOwnProps } from "metabase/dashboard/containers/CreateDashboardForm";
import { useSelector } from "metabase/lib/redux";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import { LinkContent } from "./AddToDashSelectDashModal.styled";
import { useMostRecentlyViewedDashboard } from "./hooks";
import { getInitialOpenCollectionId } from "./utils";

function mapStateToProps(state: State) {
  return {
    dashboards: state.entities.dashboards,
  };
}

interface AddToDashSelectDashModalProps {
  card: Card;
  onChangeLocation: (location: string) => void;
  onClose: () => void;
  dashboards: Record<string, Dashboard>;
}

type DashboardPickerProps = ComponentPropsWithoutRef<typeof DashboardPicker>;

const AddToDashSelectDashModal = ({
  card,
  dashboards,
  onClose,
  onChangeLocation,
}: AddToDashSelectDashModalProps) => {
  const [shouldCreateDashboard, setShouldCreateDashboard] = useState(false);

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

  const navigateToDashboard: Required<CreateDashboardFormOwnProps>["onCreate"] =
    dashboard => {
      onChangeLocation(
        Urls.dashboard(dashboard, {
          editMode: true,
          addCardWithId: card.id,
        }),
      );
    };

  const onDashboardSelected: DashboardPickerProps["onChange"] = dashboardId => {
    if (dashboardId) {
      const dashboard = dashboards[dashboardId];
      navigateToDashboard(dashboard);
    }
  };

  if (shouldCreateDashboard) {
    return (
      <CreateDashboardModalConnected
        filterPersonalCollections={
          isQuestionInPersonalCollection ? "only" : undefined
        }
        collectionId={card.collection_id}
        onCreate={navigateToDashboard}
        onClose={() => setShouldCreateDashboard(false)}
      />
    );
  }

  const isLoading =
    mostRecentlyViewedDashboardQuery.isLoading || collectionQuery.isLoading;
  const error = mostRecentlyViewedDashboardQuery.error ?? collectionQuery.error;

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ModalContent
      id="AddToDashSelectDashModal"
      title={
        card.dataset
          ? t`Add this model to a dashboard`
          : t`Add this question to a dashboard`
      }
      onClose={onClose}
    >
      <DashboardPicker
        onOpenCollectionChange={setOpenCollectionId}
        filterPersonalCollections={
          isQuestionInPersonalCollection ? "only" : undefined
        }
        onChange={onDashboardSelected}
        collectionId={initialOpenCollectionId}
        value={mostRecentlyViewedDashboardQuery.data?.id}
      />
      {showCreateNewDashboardOption && (
        <Link onClick={() => setShouldCreateDashboard(true)} to="">
          <LinkContent>
            <Icon name="add" className="mx1" />
            <h4>{t`Create a new dashboard`}</h4>
          </LinkContent>
        </Link>
      )}
    </ModalContent>
  );
};

export const ConnectedAddToDashSelectDashModal = connect(mapStateToProps)(
  AddToDashSelectDashModal,
);
