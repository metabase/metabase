import React from "react";
import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
import { CollectionId } from "metabase-types/api";
import AppBarSmall from "./AppBarSmall";
import AppBarLarge from "./AppBarLarge";
import { AppBarRoot } from "./AppBar.styled";

export interface AppBarProps {
  collectionId?: CollectionId;
  isNavBarOpen?: boolean;
  isNavBarVisible?: boolean;
  isSearchVisible?: boolean;
  isNewButtonVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
}

const AppBar = (props: AppBarProps): JSX.Element => {
  const isSmallScreen = useIsSmallScreen();

  return (
    <AppBarRoot>
      {isSmallScreen ? <AppBarSmall {...props} /> : <AppBarLarge {...props} />}
    </AppBarRoot>
  );
};

export default AppBar;
