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

import { EmbedOptions, State } from "metabase-types/store";

import { getIsNavbarOpen, closeNavbar, toggleNavbar } from "metabase/redux/app";
import { isMac } from "metabase/lib/browser";
import { IFRAMED, isSmallScreen } from "metabase/lib/dom";
import { getEmbedOptions } from "metabase/selectors/embed";

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
  isEmbedded: boolean;
  embedOptions: EmbedOptions;
  toggleNavbar: () => void;
  closeNavbar: () => void;
};

function mapStateToProps(state: State) {
  return {
    isNavbarOpen: getIsNavbarOpen(state),
    isEmbedded: IFRAMED,
    embedOptions: getEmbedOptions(state),
  };
}

const mapDispatchToProps = {
  toggleNavbar,
  closeNavbar,
};

function HomepageLink({ handleClick }: { handleClick: () => void }) {
  return (
    <LogoLink to="/" onClick={handleClick} data-metabase-event="Navbar;Logo">
      <LogoIcon size={24} />
    </LogoLink>
  );
}

function AppBar({
  isNavbarOpen,
  isEmbedded,
  embedOptions,
  toggleNavbar,
  closeNavbar,
}: Props) {
  const [isSearchActive, setSearchActive] = useState(false);
  const hasSearch = !isEmbedded || embedOptions.search;
  const hasNewButton = !isEmbedded || embedOptions.new_button;
  const hasSidebar = !isEmbedded || embedOptions.side_nav;

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
      <LeftContainer isLogoActive={!hasSidebar} isSearchActive={isSearchActive}>
        <HomepageLink handleClick={onLogoClick} />
        {hasSidebar && (
          <SidebarButtonContainer>
            <Tooltip
              tooltip={sidebarButtonTooltip}
              isEnabled={!isSmallScreen()}
            >
              <SidebarButton
                isSidebarOpen={isNavbarOpen}
                onClick={toggleNavbar}
              />
            </Tooltip>
          </SidebarButtonContainer>
        )}
      </LeftContainer>
      {!isSearchActive && (
        <MiddleContainer>
          <HomepageLink handleClick={onLogoClick} />
        </MiddleContainer>
      )}
      {(hasSearch || hasNewButton) && (
        <RightContainer>
          {hasSearch && (
            <SearchBarContainer>
              <SearchBarContent>
                <SearchBar
                  onSearchActive={onSearchActive}
                  onSearchInactive={onSearchInactive}
                />
              </SearchBarContent>
            </SearchBarContainer>
          )}
          {hasNewButton && <NewButton />}
        </RightContainer>
      )}
    </AppBarRoot>
  );
}

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AppBar);
