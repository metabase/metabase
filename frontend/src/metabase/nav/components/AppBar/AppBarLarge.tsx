import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import { Nav as DetailViewNav } from "metabase/detail-view/components";
import { MetabotAppBarButton } from "metabase/metabot/components/MetabotAppBarButton";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import type { DetailViewState } from "metabase/redux/store";
import { Box, Flex } from "metabase/ui";
import type { CollectionId, SearchResult } from "metabase-types/api";

import { AppSwitcher } from "../AppSwitcher";
import NewItemButton from "../NewItemButton";
import { SearchBar } from "../search/SearchBar";
import { SearchButton } from "../search/SearchButton/SearchButton";

import S from "./AppBar.module.css";
import { AppBarLogo } from "./AppBarLogo";
import { AppBarToggle } from "./AppBarToggle";

export interface AppBarLargeProps {
  collectionId?: CollectionId;
  detailView: DetailViewState | null;
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isMetabotVisible?: boolean;
  isDocumentSidebarOpen?: boolean;
  isLogoVisible?: boolean;
  isSearchVisible?: boolean;
  isEmbeddingIframe?: boolean;
  isNewButtonVisible?: boolean;
  isAppSwitcherVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  isMetricsViewer?: boolean;
  collectionBreadcrumbs?: ReactNode;
  questionLineage?: ReactNode;
  onSearchItemSelect?: (result: SearchResult) => void;
  onToggleNavbar: () => void;
  onOpenNavbar: () => void;
}

export const AppBarLarge = ({
  detailView,
  collectionId,
  isNavBarOpen,
  isNavBarEnabled,
  isMetabotVisible,
  isDocumentSidebarOpen,
  isLogoVisible,
  isSearchVisible,
  isEmbeddingIframe,
  isNewButtonVisible,
  isAppSwitcherVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  isMetricsViewer,
  collectionBreadcrumbs,
  questionLineage,
  onSearchItemSelect,
  onToggleNavbar,
  onOpenNavbar,
}: AppBarLargeProps): JSX.Element => {
  const isNavBarVisible = isNavBarOpen && isNavBarEnabled;
  const isInfoVisible = !isNavBarVisible || isQuestionLineageVisible;
  const { isVisible: isGitSyncVisible } =
    PLUGIN_REMOTE_SYNC.useGitSyncVisible();

  const { hasMetabotAccess: isMetabotVisibleToUser } =
    useUserMetabotPermissions();

  return (
    <Flex
      className={cx(S.navBar, S.withTransition, {
        [S.withBorder]:
          isNavBarVisible ||
          isMetabotVisible ||
          isDocumentSidebarOpen ||
          isMetricsViewer,
      })}
      align="center"
      gap="lg"
      h={APP_BAR_HEIGHT}
      pl="1.325rem"
      pr="lg"
      bg="background_page-primary"
    >
      <Flex align="center" miw="5rem" flex="1 1 auto">
        <AppBarToggle
          isNavBarEnabled={isNavBarEnabled}
          isNavBarOpen={isNavBarOpen}
          onToggleClick={onToggleNavbar}
        />
        <AppBarLogo
          isLogoVisible={isLogoVisible}
          isNavBarEnabled={isNavBarEnabled}
          isGitSyncVisible={isGitSyncVisible}
          onLogoClick={onOpenNavbar}
        />
        <PLUGIN_REMOTE_SYNC.GitSyncAppBarControls />
        <Flex
          className={cx(S.fade, { [S.hidden]: !isInfoVisible })}
          opacity={isInfoVisible ? 1 : 0}
          miw={0}
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
        </Flex>
      </Flex>
      {(isSearchVisible ||
        isNewButtonVisible ||
        isAppSwitcherVisible ||
        isMetabotVisibleToUser) && (
        <Flex
          align="center"
          gap="sm"
          justify="flex-end"
          maw="32.5rem"
          flex="1 1 auto"
        >
          {isSearchVisible &&
            (isEmbeddingIframe ? (
              <SearchBar onSearchItemSelect={onSearchItemSelect} />
            ) : (
              <SearchButton mr="lg" />
            ))}
          {isNewButtonVisible && <NewItemButton collectionId={collectionId} />}
          {<MetabotAppBarButton />}
          {isAppSwitcherVisible && (
            <Box c="text-primary" aria-label={t`Settings menu`}>
              <AppSwitcher />
            </Box>
          )}
        </Flex>
      )}
    </Flex>
  );
};
