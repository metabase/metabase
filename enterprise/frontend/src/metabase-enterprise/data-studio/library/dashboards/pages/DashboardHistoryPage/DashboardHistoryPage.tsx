import { ActivityTimelineCard } from "metabase/common/data-studio/components/ActivityTimelineCard";
import type { Dashboard } from "metabase-types/api";

import { DashboardPageShell } from "../../components/DashboardPageShell";
import { useCanEditDashboard } from "../../hooks/use-can-edit-dashboard";

export function DashboardHistoryPage() {
  return (
    <DashboardPageShell data-testid="dashboard-history-page">
      {(dashboard) => <DashboardHistory dashboard={dashboard} />}
    </DashboardPageShell>
  );
}

type DashboardHistoryProps = {
  dashboard: Dashboard;
};

function DashboardHistory({ dashboard }: DashboardHistoryProps) {
  const canEdit = useCanEditDashboard(dashboard);

  return (
    <ActivityTimelineCard
      entity="dashboard"
      id={dashboard.id}
      moderationReviews={dashboard.moderation_reviews}
      canWrite={canEdit}
      data-testid="dashboard-history-list"
    />
  );
}
