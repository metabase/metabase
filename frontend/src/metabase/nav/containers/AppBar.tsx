import React, { useCallback, useMemo, useState, ReactNode } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import Tooltip from "metabase/components/Tooltip";
import LogoIcon from "metabase/components/LogoIcon";
import SearchBar from "metabase/nav/components/SearchBar";
import SidebarButton from "metabase/nav/components/SidebarButton";
import NewItemButton from "metabase/nav/components/NewItemButton";
import PathBreadcrumbs from "../components/PathBreadcrumbs/PathBreadcrumbs";

import { CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";

import { getIsNavbarOpen, closeNavbar, toggleNavbar } from "metabase/redux/app";
import {
  getIsNewButtonVisible,
  getIsSearchVisible,
  getCollectionId,
  getShowBreadcumb,
  RouterProps,
} from "metabase/selectors/app";
import { isMac } from "metabase/lib/browser";
import { isSmallScreen } from "metabase/lib/dom";

import {
  AppBarRoot,
  LogoLink,
  SearchBarContainer,
  SearchBarContent,
  LeftContainer,
  MiddleContainer,
  RightContainer,
  SidebarButtonContainer,
  PathBreadcrumbsContainer,
} from "./AppBar.styled";

type Props = {
  isNavBarOpen: boolean;
  isNavBarVisible: boolean;
  isSearchVisible: boolean;
  isNewButtonVisible: boolean;
  collectionId?: CollectionId;
  showBreadcrumb: boolean;
  toggleNavbar: () => void;
  closeNavbar: () => void;
};

function mapStateToProps(state: State, props: RouterProps) {
  return {
    isNavBarOpen: getIsNavbarOpen(state),
    isSearchVisible: getIsSearchVisible(state),
    isNewButtonVisible: getIsNewButtonVisible(state),
    collectionId: getCollectionId(state),
    showBreadcrumb: getShowBreadcumb(state, props),
  };
}

const mapDispatchToProps = {
  toggleNavbar,
  closeNavbar,
};

function HomepageLink({ handleClick }: { handleClick: () => void }) {
  return (
    <LogoLink to="/" onClick={handleClick} data-metabase-event="Navbar;Logo">
      <LogoIcon height={32} />
    </LogoLink>
  );
}

function AppBar({
  isNavBarOpen,
  isNavBarVisible,
  isSearchVisible,
  isNewButtonVisible,
  collectionId,
  toggleNavbar,
  closeNavbar,
  showBreadcrumb,
}: Props) {
  const [isSearchActive, setSearchActive] = useState(false);

  const onLogoClick = useCallback(() => {
    if (isSmallScreen()) {
      closeNavbar();
    }
  }, [closeNavbar]);

  const onSearchActive = useCallback(() => {
    if (isSmallScreen()) {
      setSearchActive(true);
      closeNavbar();
    }
  }, [closeNavbar]);

  const onSearchInactive = useCallback(() => {
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
        <HomepageLink handleClick={onLogoClick} />
        {isNavBarVisible && (
          <SidebarButtonContainer>
            <Tooltip
              tooltip={sidebarButtonTooltip}
              isEnabled={!isSmallScreen()}
            >
              <SidebarButton
                isSidebarOpen={isNavBarOpen}
                onClick={toggleNavbar}
              />
            </Tooltip>
          </SidebarButtonContainer>
        )}
        {showBreadcrumb && (
          <PathBreadcrumbsContainer isVisible={!isNavBarOpen}>
            <PathBreadcrumbs collectionId={collectionId} />
          </PathBreadcrumbsContainer>
        )}
      </LeftContainer>
      {!isSearchActive && (
        <MiddleContainer>
          <HomepageLink handleClick={onLogoClick} />
        </MiddleContainer>
      )}
      {(isSearchVisible || isNewButtonVisible) && (
        <RightContainer>
          {isSearchVisible && (
            <SearchBarContainer>
              <SearchBarContent>
                <SearchBar
                  onSearchActive={onSearchActive}
                  onSearchInactive={onSearchInactive}
                />
              </SearchBarContent>
            </SearchBarContainer>
          )}
          {isNewButtonVisible && <NewItemButton />}
        </RightContainer>
      )}
    </AppBarRoot>
  );
}

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AppBar);
