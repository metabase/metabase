import { ActionIcon, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./SidebarNavButton.module.css";
import type { SidebarNavButtonProps, SidebarNavDirection } from "./types";

const NAV_ICONS: Record<SidebarNavDirection, IconName> = {
  previous: "chevronup",
  next: "chevrondown",
};

export const SidebarNavButton = ({
  direction,
  label,
  disabled,
  onClick,
}: SidebarNavButtonProps) => (
  <ActionIcon
    aria-label={label}
    size="lg"
    className={S.navButton}
    disabled={disabled}
    onClick={onClick}
  >
    <Icon name={NAV_ICONS[direction]} />
  </ActionIcon>
);
