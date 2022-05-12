import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import Tooltip from "metabase/components/Tooltip";
import LogoIcon from "metabase/components/LogoIcon";

import SearchBar from "metabase/nav/components/SearchBar";
import SidebarButton from "metabase/nav/components/SidebarButton";
import NewButton from "metabase/nav/containers/NewButton";

import { State } from "metabase-types/store";

import { getIsNavbarOpen, closeNavbar, toggleNavbar } from "metabase/redux/app";
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
} from "./AppBar.styled";

type Props = {
  isNavbarOpen: boolean;
  toggleNavbar: () => void;
  closeNavbar: () => void;
};

function mapStateToProps(state: State) {
  return {
    isNavbarOpen: getIsNavbarOpen(state),
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

function AppBar({ isNavbarOpen, toggleNavbar, closeNavbar }: Props) {
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
    const message = isNavbarOpen ? t`Close sidebar` : t`Open sidebar`;
    const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
    return `${message} ${shortcut}`;
  }, [isNavbarOpen]);

  return (
    <AppBarRoot>
      <LeftContainer isSearchActive={isSearchActive}>
        <HomepageLink handleClick={onLogoClick} />
        <SidebarButtonContainer>
          <Tooltip tooltip={sidebarButtonTooltip} isEnabled={!isSmallScreen()}>
            <SidebarButton
              isSidebarOpen={isNavbarOpen}
              onClick={toggleNavbar}
            />
          </Tooltip>
        </SidebarButtonContainer>
      </LeftContainer>
      {!isSearchActive && (
        <MiddleContainer>
          <HomepageLink handleClick={onLogoClick} />
        </MiddleContainer>
      )}
      <RightContainer>
        <SearchBarContainer>
          <SearchBarContent>
            <SearchBar
              onSearchActive={onSearchActive}
              onSearchInactive={onSearchInactive}
            />
          </SearchBarContent>
        </SearchBarContainer>
        <NewButton />
      </RightContainer>
    </AppBarRoot>
  );
}

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AppBar);
