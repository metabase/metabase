import { useCallback, useState } from "react";
import { User } from "metabase-types/api";
import SearchBar from "../SearchBar";
import ProfileLink from "../ProfileLink";
import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import AppBarToggle from "./AppBarToggle";
import AppBarLogo from "./AppBarLogo";
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
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
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
  isNavBarOpen,
  isNavBarEnabled,
  isLogoVisible,
  isSearchVisible,
  isProfileLinkVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  onToggleNavbar,
  onCloseNavbar,
  onLogout,
}: AppBarSmallProps): JSX.Element => {
  const isNavBarVisible = isNavBarOpen && isNavBarEnabled;

  const [isSearchActive, setSearchActive] = useState(false);
  const isInfoVisible = isQuestionLineageVisible || isCollectionPathVisible;
  const isHeaderVisible =
    isLogoVisible || isNavBarEnabled || isSearchVisible || isProfileLinkVisible;
  const isSubheaderVisible = !isNavBarVisible && isInfoVisible;

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
      {isHeaderVisible && (
        <AppBarHeader isSubheaderVisible={isSubheaderVisible}>
          <AppBarMainContainer>
            <AppBarToggleContainer>
              {isNavBarEnabled && (
                <AppBarToggle
                  isSmallAppBar
                  isNavBarOpen={isNavBarVisible}
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
          <AppBarLogoContainer isVisible={isLogoVisible && !isSearchActive}>
            <AppBarLogo
              isSmallAppBar
              isLogoVisible={isLogoVisible}
              onLogoClick={handleLogoClick}
            />
          </AppBarLogoContainer>
        </AppBarHeader>
      )}
      {isSubheaderVisible && (
        <AppBarSubheader isNavBarOpen={isNavBarVisible}>
          {isQuestionLineageVisible ? (
            <QuestionLineage />
          ) : isCollectionPathVisible ? (
            <CollectionBreadcrumbs />
          ) : null}
        </AppBarSubheader>
      )}
    </AppBarRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarSmall;
