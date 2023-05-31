import { ComponentPropsWithoutRef, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
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
import type { Card, Dashboard } from "metabase-types/api";
import type { CreateDashboardFormOwnProps } from "metabase/dashboard/containers/CreateDashboardForm";
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
      />
      <Link onClick={() => setShouldCreateDashboard(true)} to="">
        <LinkContent>
          <Icon name="add" mx={1} />
          <h4>{t`Create a new dashboard`}</h4>
        </LinkContent>
      </Link>
    </ModalContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(AddToDashSelectDashModal);
