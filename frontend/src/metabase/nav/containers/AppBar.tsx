import React from "react";
import { t } from "ttag";
import { Location, LocationDescriptorObject } from "history";

import Link from "metabase/core/components/Link";
import Tooltip from "metabase/components/Tooltip";
import LogoIcon from "metabase/components/LogoIcon";

import SearchBar from "metabase/nav/components/SearchBar";
import NewButton from "metabase/nav/containers/NewButton";
import {
  SearchBarContainer,
  SearchBarContent,
} from "metabase/nav/containers/Navbar.styled";

import Database from "metabase/entities/databases";

import { AppBarRoot, LogoIconWrapper, SidebarButton } from "./AppBar.styled";

type Props = {
  isSidebarOpen: boolean;
  location: Location;
  onToggleSidebarClick: () => void;
  onNewClick: () => void;
  onChangeLocation: (nextLocation: LocationDescriptorObject) => void;
};

function AppBar({
  isSidebarOpen,
  location,
  onToggleSidebarClick,
  onNewClick,
  onChangeLocation,
}: Props) {
  return (
    <AppBarRoot id="mainAppBar">
      <LogoIconWrapper>
        <Link to="/" data-metabase-event="Navbar;Logo">
          <LogoIcon size={24} />
        </Link>
      </LogoIconWrapper>
      <Tooltip tooltip={isSidebarOpen ? t`Close sidebar` : t`Open sidebar`}>
        <SidebarButton
          name={isSidebarOpen ? "chevronleft" : "chevronright"}
          onClick={onToggleSidebarClick}
        />
      </Tooltip>
      <SearchBarContainer>
        <SearchBarContent>
          <SearchBar location={location} onChangeLocation={onChangeLocation} />
        </SearchBarContent>
      </SearchBarContainer>
      <NewButton setModal={onNewClick} />
    </AppBarRoot>
  );
}

export default Database.loadList({ loadingAndErrorWrapper: false })(AppBar);
