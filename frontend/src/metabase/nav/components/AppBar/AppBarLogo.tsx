import React from "react";
import { t } from "ttag";
import { isMac } from "metabase/lib/browser";
import LogoIcon from "metabase/components/LogoIcon";
import Tooltip from "metabase/components/Tooltip";
import {
  LogoLink,
  LogoRoot,
  SidebarButton,
  SidebarButtonContainer,
  SidebarIcon,
} from "./AppBarLogo.styled";

export interface AppBarLogoProps {
  isNavBarOpen?: boolean;
  isLogoVisible?: boolean;
  isToggleVisible?: boolean;
  onLogoClick?: () => void;
  onToggleClick?: () => void;
}

const AppBarLogo = ({
  isNavBarOpen,
  isLogoVisible,
  isToggleVisible,
  onLogoClick,
  onToggleClick,
}: AppBarLogoProps): JSX.Element => {
  return (
    <LogoRoot>
      <LogoLink
        to="/"
        isVisible={isLogoVisible}
        onClick={onLogoClick}
        data-metabase-event="Navbar;Logo"
      >
        <LogoIcon height={32} />
      </LogoLink>
      {isToggleVisible && (
        <SidebarButtonContainer>
          <Tooltip tooltip={getSidebarTooltip(isNavBarOpen)}>
            <SidebarButton
              onClick={onToggleClick}
              data-testid="sidebar-toggle-button"
            >
              <SidebarIcon
                size={28}
                name={isNavBarOpen ? "sidebar_open" : "sidebar_closed"}
              />
            </SidebarButton>
          </Tooltip>
        </SidebarButtonContainer>
      )}
    </LogoRoot>
  );
};

const getSidebarTooltip = (isNavBarOpen?: boolean) => {
  const message = isNavBarOpen ? t`Close sidebar` : t`Open sidebar`;
  const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
  return `${message} ${shortcut}`;
};

export default AppBarLogo;
