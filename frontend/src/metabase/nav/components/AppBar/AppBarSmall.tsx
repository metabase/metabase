import React, { useCallback, useState } from "react";
import AppBarToggle from "./AppBarToggle";
import SearchBar from "../SearchBar";
import {
  AppBarToggleContainer,
  AppBarMainContainer,
  AppBarLogoContainer,
  AppBarHeader,
  AppBarSearchContainer,
} from "./AppBarSmall.styled";
import AppBarLogo from "metabase/nav/components/AppBar/AppBarLogo";

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
    <div>
      <AppBarHeader>
        <AppBarMainContainer>
          <AppBarToggleContainer>
            {isNavBarVisible && (
              <AppBarToggle
                isNavBarOpen={isNavBarOpen}
                onToggleClick={onToggleNavbar}
              />
            )}
          </AppBarToggleContainer>
          <AppBarSearchContainer>
            {isSearchVisible && (
              <SearchBar
                onSearchActive={handleSearchActive}
                onSearchInactive={handleSearchInactive}
              />
            )}
          </AppBarSearchContainer>
        </AppBarMainContainer>
        <AppBarLogoContainer isVisible={!isSearchActive}>
          <AppBarLogo onLogoClick={handleLogoClick} />
        </AppBarLogoContainer>
      </AppBarHeader>
    </div>
  );
};

export default AppBarSmall;
