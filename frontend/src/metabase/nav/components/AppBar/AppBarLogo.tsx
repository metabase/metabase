import LogoIcon from "metabase/components/LogoIcon";

import { LogoLink, LogoRoot, ToggleContainer } from "./AppBarLogo.styled";
import AppBarToggle from "./AppBarToggle";

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
          <DadosferaLogo>
            <span>Accelerated By</span>
            <img src="app/img/ddf-d.svg"></img>
          </DadosferaLogo>
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
