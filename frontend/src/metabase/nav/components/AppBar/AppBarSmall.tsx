import { useCallback, useState } from "react";

import { Nav as DetailViewNav } from "metabase/detail-view/components";
import { SearchBar } from "metabase/nav/components/search/SearchBar";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Flex } from "metabase/ui";
import type { DetailViewState } from "metabase-types/store";

import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import { ProfileLink } from "../ProfileLink";
import { SearchButton } from "../search/SearchButton/SearchButton";

import { AppBarLogo } from "./AppBarLogo";
import {
  AppBarHeader,
  AppBarLogoContainer,
  AppBarProfileLinkContainer,
  AppBarSearchContainer,
  AppBarSubheader,
  AppBarToggleContainer,
} from "./AppBarSmall.styled";
import { AppBarToggle } from "./AppBarToggle";

export interface AppBarSmallProps {
  detailView: DetailViewState | null;
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
}

const AppBarSmall = ({
  detailView,
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
    <Box bg="background-primary">
      {isHeaderVisible && (
        <AppBarHeader isSubheaderVisible={isSubheaderVisible}>
          <Flex justify="space-between" align="center" gap="sm" h="100%">
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
                    <SearchButton />
                  </Flex>
                ))}
            </AppBarSearchContainer>
            {!isEmbeddingIframe && <PLUGIN_METABOT.MetabotAppBarButton />}
            {isProfileLinkVisible && (
              <AppBarProfileLinkContainer>
                <ProfileLink />
              </AppBarProfileLinkContainer>
            )}
          </Flex>
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
          {detailView ? (
            <DetailViewNav
              rowName={detailView.rowName}
              table={detailView.table}
            />
          ) : isQuestionLineageVisible ? (
            <QuestionLineage />
          ) : isCollectionPathVisible ? (
            <CollectionBreadcrumbs />
          ) : null}
        </AppBarSubheader>
      )}
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarSmall;
