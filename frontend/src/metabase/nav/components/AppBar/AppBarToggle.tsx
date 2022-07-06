import React from "react";
import { t } from "ttag";
import { isMac } from "metabase/lib/browser";
import Tooltip from "metabase/components/Tooltip";
import { SidebarButton, SidebarIcon } from "./AppBarToggle.styled";

export interface AppBarToggleProps {
  isNavBarOpen?: boolean;
  onToggleClick?: () => void;
}

const AppBarToggle = ({
  isNavBarOpen,
  onToggleClick,
}: AppBarToggleProps): JSX.Element => {
  return (
    <Tooltip tooltip={getSidebarTooltip(isNavBarOpen)}>
      <SidebarButton onClick={onToggleClick} data-testid="sidebar-toggle">
        <SidebarIcon
          size={28}
          name={isNavBarOpen ? "sidebar_open" : "sidebar_closed"}
        />
      </SidebarButton>
    </Tooltip>
  );
};

const getSidebarTooltip = (isNavBarOpen?: boolean) => {
  const message = isNavBarOpen ? t`Close sidebar` : t`Open sidebar`;
  const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
  return `${message} ${shortcut}`;
};

export default AppBarToggle;
