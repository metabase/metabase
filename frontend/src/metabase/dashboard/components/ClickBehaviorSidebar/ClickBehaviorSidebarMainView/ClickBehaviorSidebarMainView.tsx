import React from "react";

import type {
  ActionDashboardCard,
  Dashboard,
  DashboardOrderedCard,
  ClickBehavior,
} from "metabase-types/api";
import type { UiParameter } from "metabase-lib/parameters/types";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "../utils";
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

export function isActionDashboardCard(
  dashcard: unknown,
): dashcard is ActionDashboardCard {
  return "action" in (dashcard as ActionDashboardCard);
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
  return null;
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
      {!dashcard.action && (
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
      )}

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
