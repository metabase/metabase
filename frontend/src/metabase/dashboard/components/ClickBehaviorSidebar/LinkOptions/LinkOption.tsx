import { color } from "metabase/lib/colors";

import type { IconName } from "metabase/core/components/Icon";
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
    <SidebarItem.Icon name={icon} color={color("brand")} />
    <div>
      <SidebarItem.Name>{option}</SidebarItem.Name>
    </div>
  </SidebarItem>
);
