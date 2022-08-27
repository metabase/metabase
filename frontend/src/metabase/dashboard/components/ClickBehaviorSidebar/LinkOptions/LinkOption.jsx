/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import { color } from "metabase/lib/colors";

import { SidebarItem } from "../SidebarItem";

const LinkOption = ({ option, icon, onClick }) => (
  <SidebarItem onClick={onClick}>
    <SidebarItem.Icon name={icon} color={color("brand")} />
    <div>
      <SidebarItem.Name>{option}</SidebarItem.Name>
    </div>
  </SidebarItem>
);

export default LinkOption;
