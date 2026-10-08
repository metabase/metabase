import cx from "classnames";
import { type ReactNode, useCallback, useState } from "react";

import { Nav as DetailViewNav } from "metabase/detail-view/components";
import { MetabotAppBarButton } from "metabase/metabot/components/MetabotAppBarButton";
import { SearchBar } from "metabase/nav/components/search/SearchBar";
import { APP_BAR_HEIGHT, APP_SUBHEADER_HEIGHT } from "metabase/nav/constants";
import type { DetailViewState } from "metabase/redux/store";
import { Box, Flex } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { AppSwitcher } from "../AppSwitcher";
import { SearchButton } from "../search/SearchButton/SearchButton";

import S from "./AppBar.module.css";
import { AppBarLogo } from "./AppBarLogo";
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
  const isLogoShown = isLogoVisible && !isSearchActive;

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
        <Box
          className={cx(S.borderBottom, {
            [S.borderBottomVisible]: !isSubheaderVisible,
          })}
          pos="relative"
          h={APP_BAR_HEIGHT}
          px="lg"
        >
          <Flex justify="space-between" align="center" gap="sm" h="100%">
            <Box flex="0 0 auto">
              <AppBarToggle
                isSmallAppBar
                isNavBarEnabled={isNavBarEnabled}
                isNavBarOpen={isNavBarVisible}
                onToggleClick={onToggleNavbar}
              />
            </Box>
            <Box flex="1 1 auto">
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
            </Box>
            {!isEmbeddingIframe && <MetabotAppBarButton />}
            {isAppSwitcherVisible && <AppSwitcher />}
          </Flex>
          <Box
            className={cx(S.translateCenter, S.logoFade, {
              [S.logoFadeOut]: !isLogoShown,
            })}
            opacity={isLogoShown ? 1 : 0}
            pos="absolute"
            top="50%"
            left="50%"
          >
            <AppBarLogo
              isSmallAppBar
              isLogoVisible={isLogoVisible}
              isNavBarEnabled={isNavBarEnabled}
              onLogoClick={onCloseNavbar}
            />
          </Box>
        </Box>
      )}
      {isSubheaderVisible && (
        <Box
          className={cx(S.borderBottom, S.borderBottomAnimated, {
            [S.borderBottomVisible]: isNavBarVisible,
          })}
          h={APP_SUBHEADER_HEIGHT}
          py="lg"
          pr="lg"
          pl="1.25rem"
        >
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
        </Box>
      )}
    </Box>
  );
};
