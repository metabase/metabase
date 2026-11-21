import cx from "classnames";
import { type JSX, type ReactNode, useRef } from "react";
import { t } from "ttag";

import { Nav as DetailViewNav } from "metabase/detail-view/components";
import { MetabotAppBarButton } from "metabase/metabot/components/MetabotAppBarButton";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { NavToggleActionIcon } from "metabase/nav/prototype/NavToggleActionIcon";
import { useAlignedInset } from "metabase/nav/prototype/use-aligned-inset";
import { useNavVariant } from "metabase/nav/prototype/use-nav-variant";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
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

/** PROTOTYPE: see `AppBarLargeProps.minimalLayout`. */
export type MinimalAppBarLayout = {
  background: "background_page-primary" | "background_page-secondary";
  /**
   * The page element (usually its title) the breadcrumbs line up with,
   * measured live.
   */
  alignWithSelector?: string;
};

// Clears the toggle pinned to the bar's left corner.
const MIN_BREADCRUMBS_INSET_PX = 56;

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
  /**
   * PROTOTYPE: "No top nav" variant with the nav closed — only the sidebar
   * toggle and the breadcrumbs, since the nav holds everything else.
   */
  isMinimal?: boolean;
  /**
   * PROTOTYPE: for the minimal bar, the page's own background (so the bar
   * blends in) and where its breadcrumbs start (to line up with the page's
   * heading).
   */
  minimalLayout?: MinimalAppBarLayout;
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
  isMinimal,
  minimalLayout,
}: AppBarLargeProps): JSX.Element => {
  const isNavBarVisible = isNavBarOpen && isNavBarEnabled;
  const isInfoVisible = !isNavBarVisible || isQuestionLineageVisible;
  const isGitSyncVisible = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncVisible,
  );

  const { hasMetabotAccess: isMetabotVisibleToUser } =
    useUserMetabotPermissions();
  // PROTOTYPE: the "Ask AI" variant has an Ask AI nav item, so +New leaves out
  // its AI exploration option.
  const { variant: navVariant } = useNavVariant();
  const isAskAiVariant = navVariant === "ask-ai";

  const info = (
    <Flex
      className={cx(S.fade, { [S.hidden]: !isInfoVisible })}
      opacity={isInfoVisible ? 1 : 0}
      miw={0}
    >
      {detailView ? (
        <DetailViewNav detailView={detailView} />
      ) : isQuestionLineageVisible ? (
        questionLineage
      ) : isCollectionPathVisible ? (
        collectionBreadcrumbs
      ) : null}
    </Flex>
  );

  const minimalBarRef = useRef<HTMLDivElement>(null);
  const alignedInset = useAlignedInset(
    minimalBarRef,
    isMinimal ? minimalLayout?.alignWithSelector : undefined,
    MIN_BREADCRUMBS_INSET_PX,
  );

  if (isMinimal) {
    return (
      <Flex
        ref={minimalBarRef}
        className={cx(S.navBar, S.withTransition, {
          [S.withBorder]: isMetabotVisible || isDocumentSidebarOpen,
        })}
        pos="relative"
        align="center"
        h={APP_BAR_HEIGHT}
        pl={alignedInset ?? MIN_BREADCRUMBS_INSET_PX}
        pr="lg"
        bg={minimalLayout?.background ?? "background_page-primary"}
      >
        {/* Pinned to the corner, so the breadcrumbs can start where the
            page's heading does. */}
        <Box
          pos="absolute"
          // Plain CSS lengths: `left`/`top` don't take theme spacing names.
          style={{ left: "1rem", top: "50%", transform: "translateY(-50%)" }}
        >
          <NavToggleActionIcon isNavbarOpen={false} onToggle={onToggleNavbar} />
        </Box>
        {info}
      </Flex>
    );
  }

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
      // Centers the 36px sidebar toggle over the nav's icon column (42px).
      pl="xl"
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
        <PLUGIN_REMOTE_SYNC.AppBarControls />
        {info}
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
          {isNewButtonVisible && (
            <NewItemButton
              collectionId={collectionId}
              hideAIExploration={isAskAiVariant}
            />
          )}
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
