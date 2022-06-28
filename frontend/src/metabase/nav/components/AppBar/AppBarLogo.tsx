import React from "react";
import { t } from "ttag";
import { isMac } from "metabase/lib/browser";
import LogoIcon from "metabase/components/LogoIcon";
import Tooltip from "metabase/components/Tooltip";
import {
  LogoLink,
  LogoRoot,
  SidebarButton,
  SidebarIcon,
} from "./AppBarLogo.styled";

export interface AppBarLogoProps {
  className?: string;
  isLogoActive?: boolean;
  isSidebarOpen?: boolean;
  isSidebarActive?: boolean;
  onLogoClick?: () => void;
  onSidebarToggle?: () => void;
}

const AppBarLogo = ({
  className,
  isLogoActive,
  isSidebarOpen,
  isSidebarActive,
  onLogoClick,
  onSidebarToggle,
}: AppBarLogoProps): JSX.Element => {
  return (
    <LogoRoot className={className}>
      <LogoLink
        to="/"
        isLogoActive={isLogoActive}
        onClick={onLogoClick}
        data-metabase-event="Navbar;Logo"
      >
        <LogoIcon height={32} />
      </LogoLink>
      {isSidebarActive && (
        <Tooltip tooltip={getSidebarTooltip(isSidebarOpen)}>
          <SidebarButton
            onClick={onSidebarToggle}
            data-testid="sidebar-toggle-button"
          >
            <SidebarIcon
              size={28}
              name={isSidebarOpen ? "sidebar_open" : "sidebar_closed"}
            />
          </SidebarButton>
        </Tooltip>
      )}
    </LogoRoot>
  );
};

const getSidebarTooltip = (isSidebarOpen?: boolean) => {
  const message = isSidebarOpen ? t`Close sidebar` : t`Open sidebar`;
  const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
  return `${message} ${shortcut}`;
};

export default AppBarLogo;
