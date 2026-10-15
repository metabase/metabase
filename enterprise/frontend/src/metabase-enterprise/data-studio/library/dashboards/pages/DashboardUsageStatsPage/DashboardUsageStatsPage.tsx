import { t } from "ttag";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center, Stack, Text } from "metabase/ui";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";
import type { Dashboard } from "metabase-types/api";

import { DashboardPageShell } from "../../components/DashboardPageShell";

import { UsageStatsCard } from "./UsageStatsCard";
import {
  getDashboardIdParameter,
  getUsageStatsDashcards,
  getUsageStatsParameters,
} from "./utils";

export function DashboardUsageStatsPage() {
  return (
    <DashboardPageShell data-testid="dashboard-usage-stats-page">
      {(dashboard) => <DashboardUsageStats dashboard={dashboard} />}
    </DashboardPageShell>
  );
}

type DashboardUsageStatsProps = {
  dashboard: Dashboard;
};

function DashboardUsageStats({ dashboard }: DashboardUsageStatsProps) {
  const {
    data: auditInfo,
    isLoading: isLoadingAuditInfo,
    error: auditInfoError,
  } = useGetAuditInfoQuery();
  const auditDashboardId = auditInfo?.dashboard_overview;
  const {
    data: auditDashboard,
    isLoading: isLoadingAuditDashboard,
    error: auditDashboardError,
  } = useGetDashboardQuery(
    auditDashboardId != null ? { id: auditDashboardId } : skipToken,
  );
  const isLoading = isLoadingAuditInfo || isLoadingAuditDashboard;
  const error = auditInfoError ?? auditDashboardError;

  if (isLoading || error != null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (auditDashboardId == null || auditDashboard == null) {
    return (
      <UsageStatsNotice
        message={t`To see usage stats, you need access to the Usage analytics collection.`}
      />
    );
  }

  const dashboardIdParameter = getDashboardIdParameter(auditDashboard);
  const dashcards = getUsageStatsDashcards(auditDashboard);
  if (dashboardIdParameter == null || dashcards.length === 0) {
    return (
      <UsageStatsNotice
        message={t`Usage stats aren't available for this dashboard.`}
      />
    );
  }

  const parameters = getUsageStatsParameters(auditDashboard, dashboard.id);

  return (
    <Stack gap="lg">
      {dashcards.map((dashcard) => (
        <UsageStatsCard
          key={dashcard.id}
          auditDashboardId={auditDashboardId}
          dashcard={dashcard}
          parameters={parameters}
        />
      ))}
    </Stack>
  );
}

type UsageStatsNoticeProps = {
  message: string;
};

function UsageStatsNotice({ message }: UsageStatsNoticeProps) {
  return (
    <Center py="xl">
      <Text c="text-secondary">{message}</Text>
    </Center>
  );
}
