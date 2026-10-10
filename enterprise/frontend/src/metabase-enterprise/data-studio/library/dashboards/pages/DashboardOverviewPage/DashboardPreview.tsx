import { Dashboard } from "metabase/dashboard/components/Dashboard";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import { Box, Stack } from "metabase/ui";
import type { Dashboard as DashboardType } from "metabase-types/api";

type DashboardPreviewProps = {
  dashboard: DashboardType;
};

export function DashboardPreview({ dashboard }: DashboardPreviewProps) {
  return (
    <DashboardContextProvider
      dashboardId={dashboard.id}
      prefetchedDashboard={dashboard}
      navigateToNewCardFromDashboard={null}
      dashboardActions={null}
      dashcardMenu={null}
      downloadsEnabled={{ pdf: false, results: false }}
    >
      <DashboardPreviewContent />
    </DashboardContextProvider>
  );
}

function DashboardPreviewContent() {
  const { dashboard, parameters, tabs } = useDashboardContext();
  const hasTabs = dashboard != null && tabs.length > 1;
  const hasParameters = parameters.length > 0;

  return (
    <Stack gap="sm" p="sm" data-testid="dashboard-preview">
      {hasTabs && <Dashboard.Tabs />}
      {hasParameters && <Dashboard.ParametersList />}
      {/* A fixed-width grid centers itself with auto margins, which collapse to zero width as a flex item */}
      <Box>
        <Dashboard.Grid />
      </Box>
    </Stack>
  );
}
