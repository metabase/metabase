import { useEffect } from "react";

import { setAutoApplyFilters } from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import { useDispatch } from "metabase/redux";
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
      <DashboardPreviewContent dashboard={dashboard} />
    </DashboardContextProvider>
  );
}

type DashboardPreviewContentProps = {
  dashboard: Pick<DashboardType, "id" | "auto_apply_filters">;
};

function DashboardPreviewContent({
  dashboard: hostDashboard,
}: DashboardPreviewContentProps) {
  const { dashboard, parameters, tabs } = useDashboardContext();
  const hasTabs = dashboard != null && tabs.length > 1;
  const hasParameters = parameters.length > 0;

  useAutoApplyFiltersSync(hostDashboard);

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

/**
 * The provider loads the dashboard once per id, so a saved auto-apply
 * filters setting reaches the loaded dashboard through here, without
 * reloading its cards or losing the filter values and the selected tab.
 */
function useAutoApplyFiltersSync(
  hostDashboard: Pick<DashboardType, "id" | "auto_apply_filters">,
) {
  const dispatch = useDispatch();
  const { dashboard } = useDashboardContext();
  const isOutOfSync =
    dashboard?.id === hostDashboard.id &&
    dashboard.auto_apply_filters !== hostDashboard.auto_apply_filters;

  useEffect(() => {
    if (isOutOfSync) {
      dispatch(setAutoApplyFilters(hostDashboard.auto_apply_filters));
    }
  }, [dispatch, isOutOfSync, hostDashboard.auto_apply_filters]);
}
