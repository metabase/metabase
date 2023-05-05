import React, { ComponentPropsWithoutRef, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";
import DashboardPicker from "metabase/containers/DashboardPicker";
import type { State } from "metabase-types/store";
import { CreateDashboardFormOwnProps } from "metabase/dashboard/containers/CreateDashboardForm";
import * as Urls from "metabase/lib/urls";
import CreateDashboardModal from "metabase/dashboard/containers/CreateDashboardModal";
import { Card, Dashboard } from "metabase-types/api";
import {
  useCollectionQuery,
  useMostRecentlyViewedDashboard,
} from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { LinkContent } from "./AddToDashSelectDashModal.styled";
import type { PickerValue } from "./ItemPicker";

function mapStateToProps(state: State) {
  return {
    dashboards: state.entities.dashboards,
  };
}

interface AddToDashSelectDashModalProps {
  card: Card;
  onChangeLocation: (location: string) => void;
  onClose: () => void;
  dashboards: Record<number, Dashboard>;
}

type DashboardPickerProps = ComponentPropsWithoutRef<typeof DashboardPicker>;

const AddToDashSelectDashModal = ({
  card,
  dashboards,
  onClose,
  onChangeLocation,
}: AddToDashSelectDashModalProps) => {
  const [shouldCreateDashboard, setShouldCreateDashboard] = useState(false);
  const queryDash = useMostRecentlyViewedDashboard();

  const collectionId = queryDash.data?.collection_id;
  const collectionQuery = useCollectionQuery({
    id: collectionId || "root",
    enabled: typeof collectionId !== "undefined",
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

  return (
    <LoadingAndErrorWrapper
      loading={queryDash.isLoading || collectionQuery.isLoading}
      error={[queryDash.error, collectionQuery.error]
        .filter(Boolean)
        .map(error => (error as Error).message)
        .join(", ")}
      noWrapper
    >
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
          value={queryDash.data?.id as PickerValue | undefined}
        />
        <Link onClick={() => setShouldCreateDashboard(true)} to="">
          <LinkContent>
            <Icon name="add" mx={1} />
            <h4>{t`Create a new dashboard`}</h4>
          </LinkContent>
        </Link>
      </ModalContent>
    </LoadingAndErrorWrapper>
  );
};

export default connect(mapStateToProps)(AddToDashSelectDashModal);
