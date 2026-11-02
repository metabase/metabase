import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import { setArchivedDashboard } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/redux";
import { useParams } from "metabase/router";
import { Button, Modal, Skeleton } from "metabase/ui";
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

export const ArchiveDashboardModalConnectedInner = (props: OwnProps) => {
  const params = useParams();
  const id = Urls.extractCollectionId(params?.slug);
  const { currentData: dashboard, error } = useGetDashboardQuery(
    id != null ? { id } : skipToken,
  );

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (id == null) {
    return null;
  }

  if (!dashboard) {
    return <ArchiveDashboardModalSkeleton onClose={props.onClose} />;
  }

  return (
    <ArchiveDashboardModal onClose={props.onClose} dashboard={dashboard} />
  );
};

function ArchiveDashboardModalSkeleton({ onClose }: OwnProps) {
  return (
    <Modal opened title={t`Move this dashboard to trash?`} onClose={onClose}>
      <LoadingSkeleton py="xs">
        <Skeleton h={14} w="60%" radius="xs" />
      </LoadingSkeleton>
      <Modal.Footer>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button color="negative" variant="filled" disabled>
          {t`Move to trash`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export const ArchiveDashboardModalConnected =
  ArchiveDashboardModalConnectedInner;
