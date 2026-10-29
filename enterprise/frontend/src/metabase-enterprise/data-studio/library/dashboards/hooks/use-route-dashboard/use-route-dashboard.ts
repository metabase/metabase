import { t } from "ttag";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

type RouteDashboardResult = {
  dashboard: Dashboard | undefined;
  isLoading: boolean;
  error: unknown;
};

export function useRouteDashboard(): RouteDashboardResult {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = Urls.extractEntityId(params.dashboardId);
  const {
    currentData: dashboard,
    isFetching,
    error,
  } = useGetDashboardQuery(
    dashboardId != null ? { id: dashboardId } : skipToken,
  );

  if (dashboardId == null) {
    return {
      dashboard: undefined,
      isLoading: false,
      error: t`Dashboard not found.`,
    };
  }

  return {
    dashboard,
    isLoading: dashboard === undefined && isFetching,
    error,
  };
}
