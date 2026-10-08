import { useMemo } from "react";

import { useListRevisionsQuery, useRevertRevisionMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { RevisionHistoryTimeline } from "metabase/common/components/RevisionHistoryTimeline";
import { getTimelineEvents } from "metabase/common/components/RevisionHistoryTimeline/utils";
import { getUser } from "metabase/current-user";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Box, Card } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import S from "../components/LibraryDashboardOverview.module.css";
import { LibraryDashboardPage } from "../components/LibraryDashboardPage";

// Like the metric History tab (/data-studio/library/metrics/:id/history)
export function LibraryDashboardHistoryPage() {
  return (
    <LibraryDashboardPage data-testid="library-dashboard-history-page">
      {(dashboard) => (
        <Card withBorder shadow="none" p="lg" flex={1} className={S.history}>
          <Box maw={800} pt="lg" px="lg">
            <DashboardActivityTimeline dashboard={dashboard} />
          </Box>
        </Card>
      )}
    </LibraryDashboardPage>
  );
}

function DashboardActivityTimeline({ dashboard }: { dashboard: Dashboard }) {
  const {
    data: revisions,
    isLoading,
    error,
  } = useListRevisionsQuery({ id: dashboard.id, entity: "dashboard" });
  const [revertRevision] = useRevertRevisionMutation();
  const currentUser = useSelector(getUser);

  const events = useMemo(() => {
    const moderationEvents = PLUGIN_MODERATION.getModerationTimelineEvents(
      dashboard.moderation_reviews ?? [],
      currentUser,
    );
    const revisionEvents = getTimelineEvents({ revisions, currentUser });
    return [...revisionEvents, ...moderationEvents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [dashboard.moderation_reviews, revisions, currentUser]);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <RevisionHistoryTimeline
      events={events}
      data-testid="dashboard-history-list"
      revert={(revision) =>
        revertRevision({
          entity: "dashboard",
          id: dashboard.id,
          revision_id: revision.id,
        }).unwrap()
      }
      canWrite={dashboard.can_write}
      entity="dashboard"
    />
  );
}
