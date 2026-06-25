import { useState } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { setArchivedDashboard } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

type OwnProps = {
  onClose: () => void;
};

type ArchiveDashboardModalProps = OwnProps & {
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
    try {
      await dispatch(setArchivedDashboard(true));
    } finally {
      setLoading(false);
    }
  };

  const hasDashboardQuestions = dashboard.dashcards
    .filter((dc) => dc.card) // card might be null for virtual cards
    .some((dc) => _.isNumber(dc.card.dashboard_id));

  const message = hasDashboardQuestions
    ? t`This will trash the dashboard and the questions that are saved in it. Are you sure you want to do this?`
    : t`Are you sure you want to do this?`;

  return (
    <ArchiveModal
      title={t`Move this dashboard to trash?`}
      model="dashboard"
      modelId={Number(dashboard.id)}
      message={message}
      onClose={onClose}
      isLoading={loading}
      onArchive={archive}
    />
  );
};

export const ArchiveDashboardModalConnectedInner = (
  props: OwnProps & { params: { slug?: string } },
) => {
  const id = Urls.extractCollectionId(props.params?.slug);
  const { currentData: dashboard, error } = useGetDashboardQuery(
    id != null ? { id } : skipToken,
  );

  return (
    <LoadingAndErrorWrapper
      loading={id != null && !dashboard}
      error={error}
      noWrapper
    >
      {dashboard && (
        <ArchiveDashboardModal onClose={props.onClose} dashboard={dashboard} />
      )}
    </LoadingAndErrorWrapper>
  );
};

export const ArchiveDashboardModalConnected = withRouter(
  ArchiveDashboardModalConnectedInner,
);
