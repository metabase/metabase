import React from "react";
import { t } from "ttag";
import { isMac } from "metabase/lib/browser";
import Tooltip from "metabase/core/components/Tooltip";
import { SidebarButton, SidebarIcon } from "./AppBarToggle.styled";

export interface AppBarToggleProps {
  isLogoVisible?: boolean;
  isNavBarOpen?: boolean;
  onToggleClick?: () => void;
}

const AppBarToggle = ({
  isLogoVisible = true,
  isNavBarOpen,
  onToggleClick,
}: AppBarToggleProps): JSX.Element => {
  return (
    <Tooltip tooltip={getSidebarTooltip(isNavBarOpen)}>
      <SidebarButton
        isLogoVisible={isLogoVisible}
        onClick={onToggleClick}
        data-testid="sidebar-toggle"
        aria-label="sidebar-toggle"
      >
        <SidebarIcon
          isLogoVisible={isLogoVisible}
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
