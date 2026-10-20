import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Flex } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import type { DashboardTabsInfo } from "../../hooks/use-dashboard-tabs-info";

import { DashboardArchivedBanner } from "./DashboardArchivedBanner";
import { DashboardBreadcrumbs } from "./DashboardBreadcrumbs";
import { DashboardHeaderActions } from "./DashboardHeaderActions";
import { DashboardMoreMenu } from "./DashboardMoreMenu";
import { DashboardNameInput } from "./DashboardNameInput";
import { DashboardTabs } from "./DashboardTabs";

type DashboardHeaderProps = {
  dashboard: Dashboard;
  tabsInfo: DashboardTabsInfo;
};

export function DashboardHeader({ dashboard, tabsInfo }: DashboardHeaderProps) {
  return (
    <>
      {dashboard.archived && <DashboardArchivedBanner dashboard={dashboard} />}
      <PaneHeader
        data-testid="dashboard-pane-header"
        title={
          <Flex align="center" gap="sm">
            <DashboardNameInput dashboard={dashboard} />
            <PLUGIN_MODERATION.EntityModerationIcon
              moderationReviews={dashboard.moderation_reviews}
            />
          </Flex>
        }
        icon="dashboard"
        menu={<DashboardMoreMenu dashboard={dashboard} />}
        tabs={<DashboardTabs dashboardId={dashboard.id} tabsInfo={tabsInfo} />}
        actions={<DashboardHeaderActions dashboard={dashboard} />}
        breadcrumbs={<DashboardBreadcrumbs dashboard={dashboard} />}
      />
    </>
  );
}
