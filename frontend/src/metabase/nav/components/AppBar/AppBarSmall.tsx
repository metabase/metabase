import React, { useCallback, useState } from "react";
import { CollectionId, User } from "metabase-types/api";
import AppBarLogo from "./AppBarLogo";
import AppBarToggle from "./AppBarToggle";
import SearchBar from "../SearchBar";
import ProfileLink from "../ProfileLink";
import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import {
  AppBarHeader,
  AppBarLogoContainer,
  AppBarMainContainer,
  AppBarProfileLinkContainer,
  AppBarRoot,
  AppBarSearchContainer,
  AppBarSubheader,
  AppBarToggleContainer,
} from "./AppBarSmall.styled";

export interface AppBarSmallProps {
  currentUser: User;
  collectionId?: CollectionId;
  isNavBarOpen?: boolean;
  isNavBarVisible?: boolean;
  isSearchVisible?: boolean;
  isProfileLinkVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
  onLogout: () => void;
}

const AppBarSmall = ({
  currentUser,
  collectionId,
  isNavBarOpen,
  isNavBarVisible,
  isSearchVisible,
  isProfileLinkVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  onToggleNavbar,
  onCloseNavbar,
  onLogout,
}: AppBarSmallProps): JSX.Element => {
  const [isSearchActive, setSearchActive] = useState(false);
  const isInfoVisible = isQuestionLineageVisible || isCollectionPathVisible;
  const isSubheaderVisible = !isNavBarOpen && isInfoVisible;

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
      <AppBarHeader isSubheaderVisible={isSubheaderVisible}>
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
          {isProfileLinkVisible && (
            <AppBarProfileLinkContainer>
              <ProfileLink user={currentUser} onLogout={onLogout} />
            </AppBarProfileLinkContainer>
          )}
        </AppBarMainContainer>
        <AppBarLogoContainer isVisible={!isSearchActive}>
          <AppBarLogo onLogoClick={handleLogoClick} />
        </AppBarLogoContainer>
      </AppBarHeader>
      {isSubheaderVisible && (
        <AppBarSubheader isNavBarOpen={isNavBarOpen}>
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
