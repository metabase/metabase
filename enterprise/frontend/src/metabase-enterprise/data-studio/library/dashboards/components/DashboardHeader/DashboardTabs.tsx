import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import * as Urls from "metabase/urls";
import type { DashboardId } from "metabase-types/api";

type DashboardTabsProps = {
  dashboardId: DashboardId;
};

export function DashboardTabs({ dashboardId }: DashboardTabsProps) {
  const contentsUrl = Urls.dataStudioDashboardContents(dashboardId);
  const tabs: PillTab[] = [
    { label: t`Overview`, to: Urls.dataStudioDashboard(dashboardId) },
    {
      label: t`Contents`,
      to: contentsUrl,
      isSelected: (pathname) => pathname.startsWith(contentsUrl),
    },
  ];

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioDashboardDependencies(dashboardId),
    });
  }

  return <PillTabNavigation tabs={tabs} />;
}
