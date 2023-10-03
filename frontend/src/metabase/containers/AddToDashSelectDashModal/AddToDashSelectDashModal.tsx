import type { ComponentPropsWithoutRef } from "react";
import { useEffect, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import Link from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";
import DashboardPicker from "metabase/containers/DashboardPicker";
import * as Urls from "metabase/lib/urls";
import CreateDashboardModal from "metabase/dashboard/containers/CreateDashboardModal";
import {
  useCollectionQuery,
  useMostRecentlyViewedDashboard,
} from "metabase/common/hooks";
import { coerceCollectionId } from "metabase/collections/utils";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import type { State } from "metabase-types/store";
import type {
  Card,
  Collection,
  CollectionId,
  Dashboard,
} from "metabase-types/api";
import type { CreateDashboardFormOwnProps } from "metabase/dashboard/containers/CreateDashboardForm";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import { useSelector } from "metabase/lib/redux";
import Collections from "metabase/entities/collections";
import { checkNotNull } from "metabase/core/utils/types";
import { LinkContent } from "./AddToDashSelectDashModal.styled";

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

export const AddToDashSelectDashModal = ({
  card,
  dashboards,
  onClose,
  onChangeLocation,
}: AddToDashSelectDashModalProps) => {
  const [shouldCreateDashboard, setShouldCreateDashboard] = useState(false);

  const mostRecentDashboardQuery = useMostRecentlyViewedDashboard();

  const collectionId = coerceCollectionId(
    mostRecentDashboardQuery.data?.collection_id,
  );
  // when collectionId is null and loading is completed, show root collection
  // as user didnt' visit any dashboard last 24hrs
  const collectionQuery = useCollectionQuery({
    id: collectionId,
    enabled: collectionId !== undefined,
  });

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

  const [openCollectionId, setOpenCollectionId] = useState<CollectionId>();
  useEffect(() => {
    setOpenCollectionId(collectionId);
  }, [collectionId]);
  const isQuestionWithinPersonalCollection =
    useIsCollectionWithinPersonalCollection(card.collection_id);
  const isOpenCollectionWithinPersonalCollection =
    useIsCollectionWithinPersonalCollection(openCollectionId);

  const shouldFetchDashboards = isQuestionWithinPersonalCollection
    ? isOpenCollectionWithinPersonalCollection
    : true;

  if (shouldCreateDashboard) {
    return (
      <CreateDashboardModal
        collectionId={card.collection_id}
        onCreate={navigateToDashboard}
        onClose={() => setShouldCreateDashboard(false)}
      />
    );
  }

  const isLoading =
    mostRecentDashboardQuery.isLoading || collectionQuery.isLoading;
  const error = mostRecentDashboardQuery.error ?? collectionQuery.error;

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
        onChange={onDashboardSelected}
        collectionId={collectionId}
        value={mostRecentDashboardQuery.data?.id}
        onOpenCollectionChange={setOpenCollectionId}
        shouldFetchDashboards={shouldFetchDashboards}
      />
      {shouldFetchDashboards && (
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

function useIsCollectionWithinPersonalCollection(
  collectionId: CollectionId | null | undefined,
) {
  const userPersonalCollectionId = checkNotNull(
    useSelector(getUserPersonalCollectionId),
  );
  const collectionsById: Record<CollectionId, Collection> = useSelector(
    Collections.selectors.getExpandedCollectionsById,
  );

  const collection = collectionId ? collectionsById[collectionId] : undefined;

  return (
    collection?.id === userPersonalCollectionId ||
    collection?.path?.includes(userPersonalCollectionId)
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(AddToDashSelectDashModal);
