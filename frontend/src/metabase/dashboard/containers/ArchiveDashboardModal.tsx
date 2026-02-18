import { useState } from "react";
import { type WithRouterProps, withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import { setArchivedDashboard } from "metabase/dashboard/actions";
import { Collections } from "metabase/entities/collections";
import { Dashboards } from "metabase/entities/dashboards";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Dashboard } from "metabase-types/api";

type OwnProps = {
  onClose?: () => void;
};

type ArchiveDashboardModalProps = OwnProps &
  WithRouterProps & {
    dashboard: Dashboard;
  };

const ArchiveDashboardModal = ({
  onClose,
  dashboard,
}: ArchiveDashboardModalProps) => {
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();

  const archive = async () => {
    setLoading(true);
    await dispatch(setArchivedDashboard(true));
    setLoading(false);
  };

  const hasDashboardQuestions = dashboard.dashcards
    .filter((dc) => dc.card) // card might be null for virtual cards
    .some((dc) => _.isNumber(dc.card.dashboard_id));

  const message = hasDashboardQuestions
    ? t`This will trash the dashboard and the questions that are saved in it. Are you sure you want to do this?`
    : t`Are you sure you want to do this?`;

  return (
    <ArchiveModal
      title={
        "is_app_age" in dashboard && dashboard.is_app_age
          ? t`Move this page to trash?`
          : t`Move this dashboard to trash?`
      }
      model="dashboard"
      modelId={typeof dashboard.id === "number" ? dashboard.id : 0}
      message={message}
      onClose={onClose ?? (() => undefined)}
      isLoading={loading}
      onArchive={archive}
    />
  );
};

export const ArchiveDashboardModalConnected = _.compose(
  Dashboards.load({
    id: (_state: unknown, props: WithRouterProps) =>
      Urls.extractCollectionId(props.params?.slug),
  }),
  Collections.load({
    id: (_state: unknown, props: { dashboard?: Dashboard }) =>
      props.dashboard?.collection_id,
    loadingAndErrorWrapper: false,
  }),
  withRouter,
)(ArchiveDashboardModal);
