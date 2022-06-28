import React, { useCallback, useState } from "react";
import AppBarLogo from "./AppBarLogo";
import AppBarToggle from "./AppBarToggle";
import SearchBar from "../SearchBar";
import {
  AppBarLeftContainer,
  AppBarRightContainer,
  AppBarRoot,
} from "./AppBarSmall.styled";

export interface AppBarSmallProps {
  isNavBarOpen?: boolean;
  isNavBarVisible?: boolean;
  isSearchVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
}

const AppBarSmall = ({
  isNavBarOpen,
  isNavBarVisible,
  isSearchVisible,
  onToggleNavbar,
  onCloseNavbar,
}: AppBarSmallProps): JSX.Element => {
  const [isSearchActive, setSearchActive] = useState(false);

  const handleLogoClick = useCallback(() => {
    onCloseNavbar();
  }, [onCloseNavbar]);

  const handleSearchActive = useCallback(() => {
    setSearchActive(true);
    onCloseNavbar();
  }, [onCloseNavbar]);

  const handleSearchInactive = useCallback(() => {
    setSearchActive(false);
  }, []);

  return (
    <AppBarRoot>
      <AppBarLeftContainer>
        {isNavBarVisible && (
          <AppBarToggle
            isNavBarOpen={isNavBarOpen}
            onToggleClick={onToggleNavbar}
          />
        )}
      </AppBarLeftContainer>
      {!isSearchActive && <AppBarLogo onLogoClick={handleLogoClick} />}
      <AppBarRightContainer>
        {isSearchVisible && (
          <SearchBar
            onSearchActive={handleSearchActive}
            onSearchInactive={handleSearchInactive}
          />
        )}
      </AppBarRightContainer>
    </AppBarRoot>
  );
};

export default AppBarSmall;
