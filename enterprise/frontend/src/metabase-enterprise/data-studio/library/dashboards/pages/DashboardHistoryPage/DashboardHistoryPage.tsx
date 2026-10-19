import { useMemo } from "react";
import { t } from "ttag";

import { useListRevisionsQuery, useRevertRevisionMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { RevisionHistoryTimeline } from "metabase/common/components/RevisionHistoryTimeline";
import { getTimelineEvents } from "metabase/common/components/RevisionHistoryTimeline/utils";
import { getUser } from "metabase/current-user";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Box, Card, Text } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { DashboardPageShell } from "../../components/DashboardPageShell";
import { useCanEditDashboard } from "../../hooks/use-can-edit-dashboard";

import S from "./DashboardHistoryPage.module.css";

export function DashboardHistoryPage() {
  return (
    <DashboardPageShell data-testid="dashboard-history-page">
      {(dashboard) => (
        <Card withBorder shadow="none" p="lg" flex={1} className={S.card}>
          <Box maw={800} pt="lg" px="lg">
            <DashboardTimeline dashboard={dashboard} />
          </Box>
        </Card>
      )}
    </DashboardPageShell>
  );
}

type DashboardTimelineProps = {
  dashboard: Dashboard;
};

function DashboardTimeline({ dashboard }: DashboardTimelineProps) {
  const canEdit = useCanEditDashboard(dashboard);
  const currentUser = useSelector(getUser);
  const {
    data: revisions,
    isLoading,
    error,
  } = useListRevisionsQuery({ entity: "dashboard", id: dashboard.id });
  const [revertRevision] = useRevertRevisionMutation();

  const events = useMemo(
    () =>
      [
        ...getTimelineEvents({ revisions, currentUser }),
        ...PLUGIN_MODERATION.getModerationTimelineEvents(
          dashboard.moderation_reviews,
          currentUser,
        ),
      ].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [dashboard.moderation_reviews, revisions, currentUser],
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (events.length === 0) {
    return <Text c="text-secondary">{t`No revision history available.`}</Text>;
  }

  return (
    <RevisionHistoryTimeline
      entity="dashboard"
      events={events}
      revert={(revision) =>
        revertRevision({
          entity: "dashboard",
          id: dashboard.id,
          revision_id: revision.id,
        }).unwrap()
      }
      canWrite={canEdit}
      data-testid="dashboard-history-list"
    />
  );
}
