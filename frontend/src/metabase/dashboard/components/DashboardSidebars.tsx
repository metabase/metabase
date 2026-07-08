import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";

import { AIDashboardAnalysisSidebar } from "./AIDashboardAnalysisSidebar/AIDashboardAnalysisSidebar";
import { ActionSidebar } from "./ActionSidebar";
import { AddCardSidebar } from "./AddCardSidebar";
import { ClickBehaviorSidebar } from "./ClickBehaviorSidebar/ClickBehaviorSidebar";
import { DashboardInfoSidebar } from "./DashboardInfoSidebar";
import { DashboardSettingsSidebar } from "./DashboardSettingsSidebar";
import DashboardSubscriptionsSidebar from "./DashboardSubscriptionsSidebar";
import { ParameterSidebar } from "./ParameterSidebar";

export function DashboardSidebars() {
  const { isFullscreen, sidebar } = useDashboardContext();
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
      return <DashboardInfoSidebar />;
    case SIDEBAR_NAME.analyze:
      return <AIDashboardAnalysisSidebar />;
    default:
      return null;
  }
}
