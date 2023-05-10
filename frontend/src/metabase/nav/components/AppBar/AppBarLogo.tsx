import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import AppBarToggle from "./AppBarToggle";
import { LogoLink, LogoRoot, ToggleContainer } from "./AppBarLogo.styled";

export interface AppBarLogoProps {
  isSmallAppBar?: boolean;
  isLogoVisible?: boolean;
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  onLogoClick?: () => void;
  onToggleClick?: () => void;
}

const AppBarLogo = ({
  isSmallAppBar,
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
          isNavBarEnabled={isNavBarEnabled}
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
            isSmallAppBar={isSmallAppBar}
            isNavBarEnabled={isNavBarEnabled}
            isLogoVisible={isLogoVisible}
            isNavBarOpen={isNavBarOpen}
            onToggleClick={onToggleClick}
          />
        </ToggleContainer>
      )}
    </LogoRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarLogo;
