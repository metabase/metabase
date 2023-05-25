import React from "react";
import { t } from "ttag";
import { isMac } from "metabase/lib/browser";
import Tooltip from "metabase/core/components/Tooltip";
import { SidebarButton, SidebarIcon } from "./AppBarToggle.styled";

export interface AppBarToggleProps {
  isSmallAppBar?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
  isNavBarOpen?: boolean;
  onToggleClick?: () => void;
}

const AppBarToggle = ({
  isSmallAppBar,
  isNavBarEnabled,
  isLogoVisible,
  isNavBarOpen,
  onToggleClick,
}: AppBarToggleProps): JSX.Element => {
  return (
    <Tooltip tooltip={getSidebarTooltip(isNavBarOpen)}>
      <SidebarButton
        isSmallAppBar={isSmallAppBar}
        isNavBarEnabled={isNavBarEnabled}
        isLogoVisible={isLogoVisible}
        onClick={onToggleClick}
        data-testid="sidebar-toggle"
        aria-label={t`Toggle sidebar`}
      >
        <SidebarIcon
          isLogoVisible={isLogoVisible}
          size={24}
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
