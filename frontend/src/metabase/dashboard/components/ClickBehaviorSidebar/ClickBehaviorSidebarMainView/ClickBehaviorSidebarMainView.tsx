import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Dashboard,
  QuestionDashboardCard,
  ClickBehavior,
} from "metabase-types/api";

import {
  SidebarContentBordered,
  SelectedClickBehaviorItemIcon,
} from "../ClickBehaviorSidebar.styled";
import { CrossfilterOptions } from "../CrossfilterOptions";
import { LinkOptions } from "../LinkOptions/LinkOptions";
import { SidebarItem } from "../SidebarItem";
import { useClickBehaviorOptionName } from "../hooks";
import { clickBehaviorOptions } from "../utils";

interface ClickBehaviorOptionsProps {
  clickBehavior: ClickBehavior;
  dashboard: Dashboard;
  dashcard: QuestionDashboardCard;
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
  return null;
}

interface ClickBehaviorSidebarMainViewProps {
  clickBehavior: ClickBehavior;
  dashboard: Dashboard;
  dashcard: QuestionDashboardCard;
  parameters: UiParameter[];
  handleShowTypeSelector: () => void;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}

export function ClickBehaviorSidebarMainView({
  clickBehavior,
  dashboard,
  dashcard,
  parameters,
  handleShowTypeSelector,
  updateSettings,
}: ClickBehaviorSidebarMainViewProps) {
  const clickBehaviorOptionName = useClickBehaviorOptionName(
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
