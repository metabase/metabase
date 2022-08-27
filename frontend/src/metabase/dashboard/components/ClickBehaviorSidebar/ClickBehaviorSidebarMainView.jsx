/* eslint-disable react/prop-types */
import React from "react";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "./utils";
import ActionOptions from "./ActionOptions";
import CrossfilterOptions from "./CrossfilterOptions";
import LinkOptions from "./LinkOptions";
import { SidebarItemWrapper } from "./SidebarItem";
import {
  CloseIconContainer,
  SidebarContentBordered,
  SidebarIconWrapper,
} from "./ClickBehaviorSidebar.styled";

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
        <SidebarItemWrapper
          onClick={handleShowTypeSelector}
          style={{
            backgroundColor: color("brand"),
            color: color("white"),
          }}
        >
          <SidebarIconWrapper
            style={{ borderColor: "transparent", paddingLeft: 12 }}
          >
            <Icon name={clickBehaviorIcon} />
          </SidebarIconWrapper>
          <div className="flex align-center full">
            <h4>{clickBehaviorOptionName}</h4>
            <CloseIconContainer>
              <Icon name="close" size={12} />
            </CloseIconContainer>
          </div>
        </SidebarItemWrapper>
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
