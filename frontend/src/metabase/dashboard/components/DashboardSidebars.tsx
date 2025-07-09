import { useSetDashboardAttributeHandler } from "metabase/dashboard/components/Dashboard/use-set-dashboard-attribute";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import DashboardSubscriptionsSidebar from "metabase/notifications/DashboardSubscriptionsSidebar";
import { ParameterSidebar } from "metabase/parameters/components/ParameterSidebar";
import { PLUGIN_AI_ENTITY_ANALYSIS } from "metabase/plugins";
import type { Dashboard as IDashboard } from "metabase-types/api";
import type { SelectedTabId, State } from "metabase-types/store";

import { ActionSidebar } from "./ActionSidebar";
import { AddCardSidebar } from "./AddCardSidebar";
import { ClickBehaviorSidebar } from "./ClickBehaviorSidebar/ClickBehaviorSidebar";
import { DashboardInfoSidebar } from "./DashboardInfoSidebar";
import { DashboardSettingsSidebar } from "./DashboardSettingsSidebar";

interface DashboardSidebarsProps {
  dashboard: IDashboard;
  isFullscreen: boolean;
  sidebar: State["dashboard"]["sidebar"];
  closeSidebar: () => void;
  selectedTabId: SelectedTabId;
}

export function DashboardSidebars({
  dashboard,
  isFullscreen,
  sidebar,
  closeSidebar,
}: DashboardSidebarsProps) {
  const setDashboardAttribute = useSetDashboardAttributeHandler();

  if (isFullscreen) {
    return null;
  }

  switch (sidebar.name) {
    case SIDEBAR_NAME.addQuestion:
      return <AddCardSidebar />;
    case SIDEBAR_NAME.action: {
      return <ActionSidebar />;
    }
    case SIDEBAR_NAME.clickBehavior:
      return <ClickBehaviorSidebar />;

    case SIDEBAR_NAME.editParameter:
      return <ParameterSidebar />;
    case SIDEBAR_NAME.settings:
      return <DashboardSettingsSidebar />;
    case SIDEBAR_NAME.sharing:
      return <DashboardSubscriptionsSidebar />;
    case SIDEBAR_NAME.info:
      return (
        <DashboardInfoSidebar
          dashboard={dashboard}
          setDashboardAttribute={setDashboardAttribute}
          onClose={closeSidebar}
        />
      );
    case SIDEBAR_NAME.analyze:
      return (
        <PLUGIN_AI_ENTITY_ANALYSIS.AIDashboardAnalysisSidebar
          dashcardId={sidebar.props?.dashcardId}
          onClose={closeSidebar}
        />
      );
    default:
      return null;
  }
}
