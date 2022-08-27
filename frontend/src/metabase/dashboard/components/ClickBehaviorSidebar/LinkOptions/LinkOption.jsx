/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

import { SidebarItemWrapper, SidebarItemStyle } from "../SidebarItem";
import { SidebarIconWrapper } from "../ClickBehaviorSidebar.styled";

const LinkOption = ({ option, icon, onClick }) => (
  <SidebarItemWrapper onClick={onClick} style={{ ...SidebarItemStyle }}>
    <SidebarIconWrapper>
      <Icon name={icon} color={color("brand")} />
    </SidebarIconWrapper>
    <div>
      <h4>{option}</h4>
    </div>
  </SidebarItemWrapper>
);

export default LinkOption;
