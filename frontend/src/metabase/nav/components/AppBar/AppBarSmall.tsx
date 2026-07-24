import { type ReactNode, useCallback, useState } from "react";

import { Nav as DetailViewNav } from "metabase/detail-view/components";
import { MetabotAppBarButton } from "metabase/metabot/components/MetabotAppBarButton";
import { SearchBar } from "metabase/nav/components/search/SearchBar";
import type { DetailViewState } from "metabase/redux/store";
import { Box, Flex } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { AppSwitcher } from "../AppSwitcher";
import { SearchButton } from "../search/SearchButton/SearchButton";

import { AppBarLogo } from "./AppBarLogo";
import {
  AppBarHeader,
  AppBarLogoContainer,
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
  isAppSwitcherVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  collectionBreadcrumbs?: ReactNode;
  questionLineage?: ReactNode;
  onSearchItemSelect?: (result: SearchResult) => void;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
}

export const AppBarSmall = ({
  detailView,
  isNavBarOpen,
  isNavBarEnabled,
  isLogoVisible,
  isSearchVisible,
  isEmbeddingIframe,
  isAppSwitcherVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  collectionBreadcrumbs,
  questionLineage,
  onSearchItemSelect,
  onToggleNavbar,
  onCloseNavbar,
}: AppBarSmallProps): JSX.Element => {
  const isNavBarVisible = isNavBarOpen && isNavBarEnabled;

  const [isSearchActive, setSearchActive] = useState(false);
  const isInfoVisible = isQuestionLineageVisible || isCollectionPathVisible;
  const isHeaderVisible =
    isLogoVisible || isNavBarEnabled || isSearchVisible || isAppSwitcherVisible;
  const isSubheaderVisible = !isNavBarVisible && isInfoVisible;

  const handleSearchActive = useCallback(() => {
    setSearchActive(true);
    onCloseNavbar();
  }, [onCloseNavbar]);

  const handleSearchInactive = useCallback(() => {
    setSearchActive(false);
  }, []);

  return (
    <Box bg="background_page-primary">
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
                    onSearchItemSelect={onSearchItemSelect}
                  />
                ) : (
                  <Flex justify="end">
                    <SearchButton />
                  </Flex>
                ))}
            </AppBarSearchContainer>
            {!isEmbeddingIframe && <MetabotAppBarButton />}
            {isAppSwitcherVisible && <AppSwitcher />}
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
            questionLineage
          ) : isCollectionPathVisible ? (
            collectionBreadcrumbs
          ) : null}
        </AppBarSubheader>
      )}
    </Box>
  );
};
