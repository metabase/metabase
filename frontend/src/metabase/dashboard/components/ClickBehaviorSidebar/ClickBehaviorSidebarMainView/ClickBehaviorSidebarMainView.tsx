import React from "react";

import type { UiParameter } from "metabase/parameters/types";
import type {
  ActionButtonDashboardCard,
  Dashboard,
  DashboardOrderedCard,
  ClickBehavior,
} from "metabase-types/api";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "../utils";
import ActionOptions from "../ActionOptions";
import CrossfilterOptions from "../CrossfilterOptions";
import LinkOptions from "../LinkOptions";
import { SidebarItem } from "../SidebarItem";
import {
  SidebarContentBordered,
  SelectedClickBehaviorItemIcon,
} from "../ClickBehaviorSidebar.styled";

interface ClickBehaviorOptionsProps {
  clickBehavior: ClickBehavior;
  dashboard: Dashboard;
  dashcard: DashboardOrderedCard;
  parameters: UiParameter[];
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}

function ClickBehaviorOptions({
  clickBehavior,
  dashboard,
  dashcard,
  parameters,
  updateSettings,
}: ClickBehaviorOptionsProps) {
  if (clickBehavior.type === "link") {
    return (
      <LinkOptions
        clickBehavior={clickBehavior}
        dashcard={dashcard}
        parameters={parameters}
        updateSettings={updateSettings}
      />
    );
  }
  if (clickBehavior.type === "crossfilter") {
    return (
      <CrossfilterOptions
        clickBehavior={clickBehavior}
        dashboard={dashboard}
        dashcard={dashcard}
        updateSettings={updateSettings}
      />
    );
  }
  return (
    <ActionOptions
      dashcard={dashcard as unknown as ActionButtonDashboardCard}
      parameters={parameters}
    />
  );
}

interface ClickBehaviorSidebarMainViewProps {
  clickBehavior: ClickBehavior;
  dashboard: Dashboard;
  dashcard: DashboardOrderedCard;
  parameters: UiParameter[];
  handleShowTypeSelector: () => void;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}

function ClickBehaviorSidebarMainView({
  clickBehavior,
  dashboard,
  dashcard,
  parameters,
  handleShowTypeSelector,
  updateSettings,
}: ClickBehaviorSidebarMainViewProps) {
  const clickBehaviorOptionName = getClickBehaviorOptionName(
    clickBehavior.type,
    dashcard,
  );
  const currentOption = clickBehaviorOptions.find(
    o => o.value === clickBehavior.type,
  );

  return (
    <>
      <SidebarContentBordered>
        <SidebarItem.Selectable
          onClick={handleShowTypeSelector}
          isSelected
          padded={false}
        >
          <SelectedClickBehaviorItemIcon
            name={currentOption?.icon || "unknown"}
          />
          <SidebarItem.Content>
            <SidebarItem.Name>{clickBehaviorOptionName}</SidebarItem.Name>
            <SidebarItem.CloseIcon />
          </SidebarItem.Content>
        </SidebarItem.Selectable>
      </SidebarContentBordered>

      <ClickBehaviorOptions
        clickBehavior={clickBehavior}
        dashboard={dashboard}
        dashcard={dashcard}
        parameters={parameters}
        updateSettings={updateSettings}
      />
    </>
  );
}

export default ClickBehaviorSidebarMainView;
