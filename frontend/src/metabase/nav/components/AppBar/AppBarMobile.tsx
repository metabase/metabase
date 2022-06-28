import React, { useCallback, useState } from "react";
import AppBarLogo from "./AppBarLogo";
import SearchBar from "../SearchBar";
import { AppBarLeftContainer, AppBarRoot } from "./AppBarMobile.styled";

export interface AppBarMobileProps {
  isNavBarOpen?: boolean;
  isNavBarVisible?: boolean;
  isSearchVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
}

const AppBarMobile = ({
  isNavBarOpen,
  isNavBarVisible,
  isSearchVisible,
  onToggleNavbar,
  onCloseNavbar,
}: AppBarMobileProps): JSX.Element => {
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
        <AppBarLogo
          isNavBarOpen={isNavBarOpen}
          isToggleVisible={isNavBarVisible}
          onToggleClick={onToggleNavbar}
        />
      </AppBarLeftContainer>
      {!isSearchActive && (
        <AppBarLogo isLogoVisible={true} onLogoClick={handleLogoClick} />
      )}
      {isSearchVisible && (
        <SearchBar
          onSearchActive={handleSearchActive}
          onSearchInactive={handleSearchInactive}
        />
      )}
    </AppBarRoot>
  );
};

export default AppBarMobile;
