import React from "react";
import { t } from "ttag";

import ClickMappings from "metabase/dashboard/components/ClickMappings";

import type {
  ClickBehavior,
  Dashboard,
  DashboardOrderedCard,
} from "metabase-types/api";

import { Heading, SidebarContent } from "./ClickBehaviorSidebar.styled";

interface Props {
  dashboard: Dashboard;
  dashcard: DashboardOrderedCard;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: ClickBehavior) => void;
}

function CrossfilterOptions({
  clickBehavior,
  dashboard,
  dashcard,
  updateSettings,
}: Props) {
  return (
    <SidebarContent>
      <Heading className="text-medium">{t`Pick one or more filters to update`}</Heading>
      <ClickMappings
        object={dashboard}
        dashcard={dashcard}
        isDash
        clickBehavior={clickBehavior}
        updateSettings={updateSettings}
        excludeParametersSources
      />
    </SidebarContent>
  );
}

export default CrossfilterOptions;
