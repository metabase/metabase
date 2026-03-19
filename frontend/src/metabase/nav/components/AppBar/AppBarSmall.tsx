import cx from "classnames";
import { useCallback, useState } from "react";

import { Nav as DetailViewNav } from "metabase/detail-view/components";
import { SearchBar } from "metabase/nav/components/search/SearchBar";
import { APP_BAR_HEIGHT, APP_SUBHEADER_HEIGHT } from "metabase/nav/constants";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Flex, rem } from "metabase/ui";
import type { DetailViewState } from "metabase-types/store";

import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import { AppSwitcher } from "../AppSwitcher";
import { SearchButton } from "../search/SearchButton/SearchButton";

import { AppBarLogo } from "./AppBarLogo";
import S from "./AppBarSmall.module.css";
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
  isAppSwitcherVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
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
    <Box bg="background-primary">
      {isHeaderVisible && (
        <Box
          className={cx(S.header, {
            [S.headerWithBorder]: !isSubheaderVisible,
          })}
          h={APP_BAR_HEIGHT}
          px="md"
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
                  />
                ) : (
                  <Flex justify="end">
                    <SearchButton />
                  </Flex>
                ))}
            </Box>
            {!isEmbeddingIframe && <PLUGIN_METABOT.MetabotAppBarButton />}
            {isAppSwitcherVisible && <AppSwitcher />}
          </Flex>
          <Box
            className={cx(S.logoContainer, {
              [S.logoContainerVisible]: isLogoVisible && !isSearchActive,
              [S.logoContainerHidden]: !(isLogoVisible && !isSearchActive),
            })}
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
          className={cx(S.subheader, {
            [S.subheaderWithBorder]: isNavBarVisible,
          })}
          h={APP_SUBHEADER_HEIGHT}
          py="md"
          px="md"
          pl={rem(20)}
        >
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
        </Box>
      )}
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarSmall;
