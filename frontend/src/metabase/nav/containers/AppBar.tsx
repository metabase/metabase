import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { Location, LocationDescriptorObject } from "history";

import Link from "metabase/core/components/Link";
import Tooltip from "metabase/components/Tooltip";
import LogoIcon from "metabase/components/LogoIcon";

import SearchBar from "metabase/nav/components/SearchBar";
import SidebarButton from "metabase/nav/components/SidebarButton";
import NewButton from "metabase/nav/containers/NewButton";
import {
  SearchBarContainer,
  SearchBarContent,
} from "metabase/nav/containers/Navbar.styled";

import Database from "metabase/entities/databases";
import { isMac } from "metabase/lib/browser";
import { isSmallScreen } from "metabase/lib/dom";

import { AppBarRoot, LogoIconWrapper } from "./AppBar.styled";

type Props = {
  isSidebarOpen: boolean;
  location: Location;
  onNewClick: () => void;
  onToggleSidebarClick: () => void;
  handleCloseSidebar: () => void;
  onChangeLocation: (nextLocation: LocationDescriptorObject) => void;
};

function AppBar({
  isSidebarOpen,
  location,
  onNewClick,
  onToggleSidebarClick,
  handleCloseSidebar,
  onChangeLocation,
}: Props) {
  const closeSidebarForSmallScreens = useCallback(() => {
    if (isSmallScreen()) {
      handleCloseSidebar();
    }
  }, [handleCloseSidebar]);

  const sidebarButtonLabel = useMemo(() => {
    const message = isSidebarOpen ? t`Close sidebar` : t`Open sidebar`;
    const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
    return `${message} ${shortcut}`;
  }, [isSidebarOpen]);

  return (
    <AppBarRoot>
      <LogoIconWrapper>
        <Link
          to="/"
          onClick={closeSidebarForSmallScreens}
          data-metabase-event="Navbar;Logo"
        >
          <LogoIcon size={24} />
        </Link>
      </LogoIconWrapper>
      <Tooltip tooltip={sidebarButtonLabel}>
        <SidebarButton
          onClick={onToggleSidebarClick}
          isSidebarOpen={isSidebarOpen}
        />
      </Tooltip>
      <SearchBarContainer>
        <SearchBarContent>
          <SearchBar
            location={location}
            onChangeLocation={onChangeLocation}
            onFocus={closeSidebarForSmallScreens}
          />
        </SearchBarContent>
      </SearchBarContainer>
      <NewButton setModal={onNewClick} />
    </AppBarRoot>
  );
}

export default Database.loadList({ loadingAndErrorWrapper: false })(AppBar);
