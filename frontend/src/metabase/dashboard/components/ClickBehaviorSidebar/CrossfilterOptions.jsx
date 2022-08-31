/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import ClickMappings from "metabase/dashboard/components/ClickMappings";

import { Heading, SidebarContent } from "./ClickBehaviorSidebar.styled";

function CrossfilterOptions({
  clickBehavior,
  dashboard,
  dashcard,
  updateSettings,
}) {
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
