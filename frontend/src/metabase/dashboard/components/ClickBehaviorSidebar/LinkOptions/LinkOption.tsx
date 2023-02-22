import React from "react";

import { color } from "metabase/lib/colors";

import { SidebarItem } from "../SidebarItem";

const LinkOption = ({
  option,
  icon,
  onClick,
}: {
  option: string;
  icon: string;
  onClick: () => void;
}) => (
  <SidebarItem onClick={onClick}>
    <SidebarItem.Icon name={icon} color={color("brand")} />
    <div>
      <SidebarItem.Name>{option}</SidebarItem.Name>
    </div>
  </SidebarItem>
);

export default LinkOption;
