import cx from "classnames";
import { t } from "ttag";

import { Nav as DetailViewNav } from "metabase/detail-view/components";
import { DETAIL_VIEW_PADDING_LEFT } from "metabase/detail-view/constants";
import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { PLUGIN_METABOT, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { Box, Flex, rem } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";
import type { DetailViewState } from "metabase-types/store";

import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import { AppSwitcher } from "../AppSwitcher";
import NewItemButton from "../NewItemButton";
import { SearchBar } from "../search/SearchBar";
import { SearchButton } from "../search/SearchButton/SearchButton";

import S from "./AppBarLarge.module.css";
import { AppBarLogo } from "./AppBarLogo";
import { AppBarToggle } from "./AppBarToggle";

export interface AppBarLargeProps {
  collectionId?: CollectionId;
  detailView: DetailViewState | null;
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isMetabotVisible?: boolean;
  isDocumentSidebarOpen?: boolean;
  isCommentSidebarOpen?: boolean;
  isLogoVisible?: boolean;
  isSearchVisible?: boolean;
  isEmbeddingIframe?: boolean;
  isNewButtonVisible?: boolean;
  isAppSwitcherVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
}

const AppBarLarge = ({
  detailView,
  collectionId,
  isNavBarOpen,
  isNavBarEnabled,
  isMetabotVisible,
  isDocumentSidebarOpen,
  isCommentSidebarOpen,
  isLogoVisible,
  isSearchVisible,
  isEmbeddingIframe,
  isNewButtonVisible,
  isAppSwitcherVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  onToggleNavbar,
}: AppBarLargeProps): JSX.Element => {
  const isNavBarVisible = isNavBarOpen && isNavBarEnabled;
  const { isVisible: isGitSyncVisible } =
    PLUGIN_REMOTE_SYNC.useGitSyncVisible();

  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();

  const hasSidebarOpen =
    isNavBarVisible ||
    isMetabotVisible ||
    isDocumentSidebarOpen ||
    isCommentSidebarOpen;

  const isInfoVisible = !isNavBarVisible || isQuestionLineageVisible;

  return (
    <Flex
      className={cx(S.root, { [S.sidebarOpen]: hasSidebarOpen })}
      align="center"
      gap="md"
      h={APP_BAR_HEIGHT}
      pl={rem(21)}
      pr="md"
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
        />
        <PLUGIN_REMOTE_SYNC.GitSyncAppBarControls />
        <Flex
          className={
            isInfoVisible ? S.infoContainerVisible : S.infoContainerHidden
          }
          miw={0}
        >
          {detailView ? (
            <DetailViewNav
              ml={DETAIL_VIEW_PADDING_LEFT - 125}
              rowName={detailView.rowName}
              table={detailView.table}
            />
          ) : isQuestionLineageVisible ? (
            <QuestionLineage />
          ) : isCollectionPathVisible ? (
            <CollectionBreadcrumbs />
          ) : null}
        </Flex>
      </Flex>
      {(isSearchVisible ||
        isNewButtonVisible ||
        isAppSwitcherVisible ||
        isMetabotEnabled) && (
        <Flex
          align="center"
          gap="sm"
          justify="flex-end"
          maw="32.5rem"
          flex="1 1 auto"
        >
          {isSearchVisible &&
            (isEmbeddingIframe ? <SearchBar /> : <SearchButton mr="md" />)}
          {isNewButtonVisible && <NewItemButton collectionId={collectionId} />}
          {<PLUGIN_METABOT.MetabotAppBarButton />}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarLarge;
