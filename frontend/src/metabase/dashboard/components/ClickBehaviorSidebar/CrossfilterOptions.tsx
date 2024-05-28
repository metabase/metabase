import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { ClickMappingsConnected } from "metabase/dashboard/components/ClickMappings";
import type {
  ClickBehavior,
  Dashboard,
  QuestionDashboardCard,
} from "metabase-types/api";

import { Heading, SidebarContent } from "./ClickBehaviorSidebar.styled";

interface Props {
  dashboard: Dashboard;
  dashcard: QuestionDashboardCard;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: ClickBehavior) => void;
}

export function CrossfilterOptions({
  clickBehavior,
  dashboard,
  dashcard,
  updateSettings,
}: Props) {
  return (
    <SidebarContent>
      <Heading
        className={CS.textMedium}
      >{t`Pick one or more filters to update`}</Heading>
      <ClickMappingsConnected
        object={dashboard}
        dashcard={dashcard}
        isDashboard
        clickBehavior={clickBehavior}
        updateSettings={updateSettings}
        excludeParametersSources
      />
    </SidebarContent>
  );
}
