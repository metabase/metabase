import type { IconName } from "metabase-types/api";

import { SidebarItem } from "../SidebarItem";

export const LinkOption = ({
  option,
  icon,
  onClick,
}: {
  option: string;
  icon: IconName;
  onClick: () => void;
}) => (
  <SidebarItem onClick={onClick}>
    <SidebarItem.Icon name={icon} c="brand" />
    <div>
      <SidebarItem.Name>{option}</SidebarItem.Name>
    </div>
  </SidebarItem>
);
