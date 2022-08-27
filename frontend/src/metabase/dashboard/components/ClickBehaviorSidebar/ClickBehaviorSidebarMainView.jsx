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

function ClickBehaviorSidebarMainView({
  clickBehavior,
  dashboard,
  dashcard,
  parameters,
}) {
  return (
    <div>
      <SidebarContentBordered>
        <SidebarItemWrapper
          onClick={() => this.setState({ showTypeSelector: true })}
          style={{
            backgroundColor: color("brand"),
            color: color("white"),
          }}
        >
          <SidebarIconWrapper
            style={{ borderColor: "transparent", paddingLeft: 12 }}
          >
            <Icon
              name={
                clickBehaviorOptions.find(o => o.value === clickBehavior.type)
                  .icon
              }
            />
          </SidebarIconWrapper>
          <div className="flex align-center full">
            <h4>{getClickBehaviorOptionName(clickBehavior.type, dashcard)}</h4>
            <CloseIconContainer>
              <Icon name="close" size={12} />
            </CloseIconContainer>
          </div>
        </SidebarItemWrapper>
      </SidebarContentBordered>

      {clickBehavior.type === "link" ? (
        <LinkOptions
          clickBehavior={clickBehavior}
          dashcard={dashcard}
          parameters={parameters}
          updateSettings={this.updateSettings}
        />
      ) : clickBehavior.type === "crossfilter" ? (
        <CrossfilterOptions
          clickBehavior={clickBehavior}
          dashboard={dashboard}
          dashcard={dashcard}
          updateSettings={this.updateSettings}
        />
      ) : clickBehavior.type === "action" ? (
        <ActionOptions
          clickBehavior={clickBehavior}
          dashcard={dashcard}
          parameters={parameters}
          updateSettings={this.updateSettings}
        />
      ) : null}
    </div>
  );
}

export default ClickBehaviorSidebarMainView;
