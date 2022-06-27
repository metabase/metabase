import React, { ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { isSmallScreen } from "metabase/lib/dom";
import { isMac } from "metabase/lib/browser";
import LogoIcon from "metabase/components/LogoIcon";
import Tooltip from "metabase/components/Tooltip";
import { CollectionId } from "metabase-types/api";
import NewItemButton from "../NewItemButton";
import SearchBar from "../SearchBar";
import SidebarButton from "../SidebarButton";
import CollectionBreadcrumbs from "../../containers/PathBreadcrumbs";
import {
  AppBarRoot,
  LeftContainer,
  MiddleContainer,
  RightContainer,
  SearchBarContainer,
  SearchBarContent,
  SidebarButtonContainer,
  LogoLink,
  LogoLinkContainer,
  CollectionBreadcrumbsContainer,
} from "./AppBar.styled";

interface AppBarProps {
  collectionId?: CollectionId;
  isNavBarOpen?: boolean;
  isNavBarVisible?: boolean;
  isSearchVisible?: boolean;
  isNewButtonVisible?: boolean;
  isCollectionPathVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
}

const AppBar = ({
  collectionId,
  isNavBarOpen,
  isNavBarVisible,
  isSearchVisible,
  isNewButtonVisible,
  isCollectionPathVisible,
  onToggleNavbar,
  onCloseNavbar,
}: AppBarProps): JSX.Element => {
  const [isSearchActive, setSearchActive] = useState(false);

  const handleLogoClick = useCallback(() => {
    if (isSmallScreen()) {
      onCloseNavbar();
    }
  }, [onCloseNavbar]);

  const handleSearchActive = useCallback(() => {
    if (isSmallScreen()) {
      setSearchActive(true);
      onCloseNavbar();
    }
  }, [onCloseNavbar]);

  const handleSearchInactive = useCallback(() => {
    if (isSmallScreen()) {
      setSearchActive(false);
    }
  }, []);

  const sidebarButtonTooltip = useMemo(() => {
    const message = isNavBarOpen ? t`Close sidebar` : t`Open sidebar`;
    const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
    return `${message} ${shortcut}`;
  }, [isNavBarOpen]);

  return (
    <AppBarRoot>
      <LeftContainer
        isLogoActive={!isNavBarVisible}
        isSearchActive={isSearchActive}
      >
        <HomepageLink onClick={handleLogoClick}>
          {isNavBarVisible && (
            <SidebarButtonContainer>
              <Tooltip
                tooltip={sidebarButtonTooltip}
                isEnabled={!isSmallScreen()}
              >
                <SidebarButton
                  isSidebarOpen={isNavBarOpen}
                  onClick={onToggleNavbar}
                />
              </Tooltip>
            </SidebarButtonContainer>
          )}
        </HomepageLink>
        {isCollectionPathVisible && (
          <CollectionBreadcrumbsContainer isVisible={!isNavBarOpen}>
            <CollectionBreadcrumbs collectionId={collectionId} />
          </CollectionBreadcrumbsContainer>
        )}
      </LeftContainer>
      {!isSearchActive && (
        <MiddleContainer>
          <HomepageLink onClick={handleLogoClick} />
        </MiddleContainer>
      )}
      {(isSearchVisible || isNewButtonVisible) && (
        <RightContainer>
          {isSearchVisible && (
            <SearchBarContainer>
              <SearchBarContent>
                <SearchBar
                  onSearchActive={handleSearchActive}
                  onSearchInactive={handleSearchInactive}
                />
              </SearchBarContent>
            </SearchBarContainer>
          )}
          {isNewButtonVisible && <NewItemButton />}
        </RightContainer>
      )}
    </AppBarRoot>
  );
};

interface HomePageLinkProps {
  children?: ReactNode;
  onClick?: () => void;
}

const HomepageLink = ({ children, onClick }: HomePageLinkProps) => (
  <LogoLinkContainer>
    <LogoLink to="/" onClick={onClick} data-metabase-event="Navbar;Logo">
      <LogoIcon height={32} />
    </LogoLink>
    {children}
  </LogoLinkContainer>
);

export default AppBar;
