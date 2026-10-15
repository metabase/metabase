import { skipToken, useListSubscriptionsQuery } from "metabase/api";
import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_AUDIT } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";
import type { DashboardId } from "metabase-types/api";

export type DashboardTabsInfo = {
  hasUsageStats: boolean;
  /** `undefined` for a non-admin, whose list holds only their own subscriptions. */
  subscriptionCount: number | undefined;
};

type DashboardTabsInfoResult = {
  tabsInfo: DashboardTabsInfo;
  isLoading: boolean;
  error: unknown;
};

/**
 * What a Data Studio dashboard's tabs depend on beyond the dashboard itself,
 * loaded together so a page can wait for all of it.
 */
export function useDashboardTabsInfo(
  dashboardId: DashboardId | undefined,
): DashboardTabsInfoResult {
  const isAdmin = useSelector(getUserIsAdmin);
  const {
    currentData: auditInfo,
    isFetching: isFetchingAuditInfo,
    error: auditInfoError,
  } = useGetAuditInfoQuery(PLUGIN_AUDIT.isEnabled ? undefined : skipToken);
  const {
    currentData: subscriptions,
    isFetching: isFetchingSubscriptions,
    error: subscriptionsError,
  } = useListSubscriptionsQuery(
    isAdmin && dashboardId != null ? { dashboard_id: dashboardId } : skipToken,
  );

  return {
    tabsInfo: {
      hasUsageStats:
        PLUGIN_AUDIT.isEnabled && auditInfo?.dashboard_overview != null,
      subscriptionCount: subscriptions?.length,
    },
    isLoading:
      (auditInfo === undefined && isFetchingAuditInfo) ||
      (subscriptions === undefined && isFetchingSubscriptions),
    error: auditInfoError ?? subscriptionsError,
  };
}
