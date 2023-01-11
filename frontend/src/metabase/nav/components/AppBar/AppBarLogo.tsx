import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import AppBarToggle from "./AppBarToggle";
import { LogoLink, LogoRoot, ToggleContainer } from "./AppBarLogo.styled";

export interface AppBarLogoProps {
  isLogoVisible?: boolean;
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  onLogoClick?: () => void;
  onToggleClick?: () => void;
}

const AppBarLogo = ({
  isLogoVisible,
  isNavBarOpen,
  isNavBarEnabled,
  onLogoClick,
  onToggleClick,
}: AppBarLogoProps): JSX.Element => {
  return (
    <LogoRoot>
      {isLogoVisible && (
        <LogoLink
          to="/"
          onClick={onLogoClick}
          data-metabase-event="Navbar;Logo"
        >
          <LogoIcon height={32} />
        </LogoLink>
      )}
      {isNavBarEnabled && (
        <ToggleContainer isLogoVisible={isLogoVisible}>
          <AppBarToggle
            isLogoVisible={isLogoVisible}
            isNavBarOpen={isNavBarOpen}
            onToggleClick={onToggleClick}
          />
        </ToggleContainer>
      )}
    </LogoRoot>
  );
};

export default AppBarLogo;
