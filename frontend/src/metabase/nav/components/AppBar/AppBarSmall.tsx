import { useCallback, useState } from "react";

import { SearchBar } from "metabase/nav/components/search/SearchBar";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Flex } from "metabase/ui";

import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import { ProfileLink } from "../ProfileLink";

import { AppBarLogo } from "./AppBarLogo";
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
import { AppBarToggle } from "./AppBarToggle";

export interface AppBarSmallProps {
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
  isSearchVisible?: boolean;
  isEmbeddingIframe?: boolean;
  isProfileLinkVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
  onLogout: () => void;
}

const AppBarSmall = ({
  isNavBarOpen,
  isNavBarEnabled,
  isLogoVisible,
  isSearchVisible,
  isEmbeddingIframe,
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
              <AppBarToggle
                isSmallAppBar
                isNavBarEnabled={isNavBarEnabled}
                isNavBarOpen={isNavBarVisible}
                onToggleClick={onToggleNavbar}
              />
            </AppBarToggleContainer>
            <AppBarSearchContainer>
              {isSearchVisible &&
                (isEmbeddingIframe ? (
                  <SearchBar
                    onSearchActive={handleSearchActive}
                    onSearchInactive={handleSearchInactive}
                  />
                ) : (
                  <Flex justify="end">
                    <PLUGIN_METABOT.SearchButton />
                  </Flex>
                ))}
            </AppBarSearchContainer>
            {isProfileLinkVisible && (
              <AppBarProfileLinkContainer>
                <ProfileLink onLogout={onLogout} />
              </AppBarProfileLinkContainer>
            )}
          </AppBarMainContainer>
          <AppBarLogoContainer isVisible={isLogoVisible && !isSearchActive}>
            <AppBarLogo
              isSmallAppBar
              isLogoVisible={isLogoVisible}
              isNavBarEnabled={isNavBarEnabled}
              onLogoClick={onCloseNavbar}
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
