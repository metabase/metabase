import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import * as Urls from "metabase/urls";
import type { DashboardId } from "metabase-types/api";

import type { DashboardTabsInfo } from "../../hooks/use-dashboard-tabs-info";

type DashboardTabsProps = {
  dashboardId: DashboardId;
  tabsInfo: DashboardTabsInfo;
};

export function DashboardTabs({ dashboardId, tabsInfo }: DashboardTabsProps) {
  const contentsUrl = Urls.dataStudioDashboardContents(dashboardId);
  const subscriptionsUrl = Urls.dataStudioDashboardSubscriptions(dashboardId);
  const tabs: PillTab[] = [
    { label: t`Overview`, to: Urls.dataStudioDashboard(dashboardId) },
    {
      label: t`Contents`,
      to: contentsUrl,
      isSelected: (pathname) => pathname.startsWith(contentsUrl),
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.dataStudioDashboardDependencies(dashboardId),
          },
        ]
      : []),
    ...(tabsInfo.hasUsageStats
      ? [
          {
            label: t`Usage stats`,
            to: Urls.dataStudioDashboardUsage(dashboardId),
          },
        ]
      : []),
    { label: t`History`, to: Urls.dataStudioDashboardHistory(dashboardId) },
    {
      label: t`Subscriptions`,
      to: subscriptionsUrl,
      count: tabsInfo.subscriptionCount,
      isSelected: (pathname) => pathname.startsWith(subscriptionsUrl),
    },
  ];

  return <PillTabNavigation tabs={tabs} />;
}
