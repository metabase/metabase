import React, { useCallback, useState } from "react";
import { CollectionId } from "metabase-types/api";
import AppBarLogo from "./AppBarLogo";
import AppBarToggle from "./AppBarToggle";
import SearchBar from "../SearchBar";
import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import {
  AppBarHeader,
  AppBarLogoContainer,
  AppBarMainContainer,
  AppBarRoot,
  AppBarSearchContainer,
  AppBarSubheader,
  AppBarToggleContainer,
} from "./AppBarSmall.styled";

export interface AppBarSmallProps {
  collectionId?: CollectionId;
  isNavBarOpen?: boolean;
  isNavBarVisible?: boolean;
  isSearchVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
}

const AppBarSmall = ({
  collectionId,
  isNavBarOpen,
  isNavBarVisible,
  isSearchVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  onToggleNavbar,
  onCloseNavbar,
}: AppBarSmallProps): JSX.Element => {
  const [isSearchActive, setSearchActive] = useState(false);
  const isInfoVisible = isQuestionLineageVisible || isCollectionPathVisible;

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
      {!isNavBarOpen && isInfoVisible && (
        <AppBarSubheader>
          {isQuestionLineageVisible ? (
            <QuestionLineage />
          ) : isCollectionPathVisible ? (
            <CollectionBreadcrumbs collectionId={collectionId} />
          ) : null}
        </AppBarSubheader>
      )}
    </AppBarRoot>
  );
};

export default AppBarSmall;
