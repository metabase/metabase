import React from "react";

import { color } from "metabase/lib/colors";

import { IconName } from "metabase/core/components/Icon";
import { SidebarItem } from "../SidebarItem";

const LinkOption = ({
  option,
  icon,
  onClick,
}: {
  option: string;
  icon: IconName;
  onClick: () => void;
}) => (
  <SidebarItem onClick={onClick}>
    <SidebarItem.Icon name={icon} color={color("brand")} />
    <div>
      <SidebarItem.Name>{option}</SidebarItem.Name>
    </div>
  </SidebarItem>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LinkOption;
