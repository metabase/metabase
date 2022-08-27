/* eslint-disable react/prop-types */
import React from "react";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "../utils";
import ActionOptions from "../ActionOptions";
import CrossfilterOptions from "../CrossfilterOptions";
import LinkOptions from "../LinkOptions";
import { SidebarItem } from "../SidebarItem";
import {
  SidebarContentBordered,
  SelectedClickBehaviorItemIcon,
} from "../ClickBehaviorSidebar.styled";

function ClickBehaviorOptions({
  clickBehavior,
  dashboard,
  dashcard,
  parameters,
  updateSettings,
}) {
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
  if (clickBehavior.type === "action") {
    return (
      <ActionOptions
        clickBehavior={clickBehavior}
        dashcard={dashcard}
        parameters={parameters}
        updateSettings={updateSettings}
      />
    );
  }
  return null;
}

function ClickBehaviorSidebarMainView({
  clickBehavior,
  dashboard,
  dashcard,
  parameters,
  handleShowTypeSelector,
  updateSettings,
}) {
  const clickBehaviorOptionName = getClickBehaviorOptionName(
    clickBehavior.type,
    dashcard,
  );
  const { icon: clickBehaviorIcon } = clickBehaviorOptions.find(
    o => o.value === clickBehavior.type,
  );

  return (
    <div>
      <SidebarContentBordered>
        <SidebarItem.Selectable
          onClick={handleShowTypeSelector}
          isSelected
          padded={false}
        >
          <SelectedClickBehaviorItemIcon name={clickBehaviorIcon} />
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
    </div>
  );
}

export default ClickBehaviorSidebarMainView;
