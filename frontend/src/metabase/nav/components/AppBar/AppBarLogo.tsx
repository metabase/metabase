import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import AppBarToggle from "./AppBarToggle";
import { LogoLink, LogoRoot, ToggleContainer } from "./AppBarLogo.styled";

export interface AppBarLogoProps {
  isNavBarOpen?: boolean;
  isToggleVisible?: boolean;
  onLogoClick?: () => void;
  onToggleClick?: () => void;
}

const AppBarLogo = ({
  isNavBarOpen,
  isToggleVisible,
  onLogoClick,
  onToggleClick,
}: AppBarLogoProps): JSX.Element => {
  return (
    <LogoRoot>
      <LogoLink to="/" onClick={onLogoClick} data-metabase-event="Navbar;Logo">
        <LogoIcon height={32} />
      </LogoLink>
      {isToggleVisible && (
        <ToggleContainer>
          <AppBarToggle
            isNavBarOpen={isNavBarOpen}
            onToggleClick={onToggleClick}
          />
        </ToggleContainer>
      )}
    </LogoRoot>
  );
};

export default AppBarLogo;
