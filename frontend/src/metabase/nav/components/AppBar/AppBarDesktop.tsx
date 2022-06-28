import React from "react";
import { CollectionId } from "metabase-types/api";
import AppBarLogo from "./AppBarLogo";
import AppBarInfo from "./AppBarInfo";
import NewItemButton from "../NewItemButton";
import SearchBar from "../SearchBar";
import {
  AppBarLeftContainer,
  AppBarRightContainer,
  AppBarRoot,
} from "./AppBarDesktop.styled";

export interface AppBarDesktopProps {
  collectionId?: CollectionId;
  isNavBarOpen?: boolean;
  isNavBarVisible?: boolean;
  isSearchVisible?: boolean;
  isNewButtonVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavBar: () => void;
  onCloseNavBar: () => void;
}

const AppBarDesktop = ({
  collectionId,
  isNavBarOpen,
  isNavBarVisible,
  isSearchVisible,
  isNewButtonVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  onToggleNavBar,
  onCloseNavBar,
}: AppBarDesktopProps): JSX.Element => {
  return (
    <AppBarRoot>
      <AppBarLeftContainer isNavBarVisible={isNavBarVisible}>
        <AppBarLogo
          isNavBarOpen={isNavBarOpen}
          isNavBarVisible={isNavBarVisible}
          onToggleNavBar={onToggleNavBar}
        />
        <AppBarInfo
          collectionId={collectionId}
          isNavBarOpen={isNavBarOpen}
          isCollectionPathVisible={isCollectionPathVisible}
          isQuestionLineageVisible={isQuestionLineageVisible}
        />
      </AppBarLeftContainer>
      {(isSearchVisible || isNewButtonVisible) && (
        <AppBarRightContainer>
          {isSearchVisible && <SearchBar />}
          {isNewButtonVisible && <NewItemButton />}
        </AppBarRightContainer>
      )}
    </AppBarRoot>
  );
};

export default AppBarDesktop;
