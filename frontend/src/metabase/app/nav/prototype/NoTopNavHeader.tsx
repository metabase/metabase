import { useElementSize } from "@mantine/hooks";
import { VisualState, useKBar } from "kbar";
import { t } from "ttag";

import {
  getIsNewButtonVisible,
  getIsSearchVisible,
} from "metabase/app/nav/selectors";
import { useInitialCollectionId } from "metabase/common/collections/hooks";
import { AppBarLogo } from "metabase/nav/components/AppBar/AppBarLogo";
import { trackAppNewButtonClicked } from "metabase/nav/components/NewItemButton/analytics";
import { NewItemMenu } from "metabase/nav/components/NewItemMenu";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { NavToggleActionIcon } from "metabase/nav/prototype/NavToggleActionIcon";
import { SpaceSwitcherHeading } from "metabase/nav/prototype/SpaceSwitcherHeading";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { useDispatch, useSelector } from "metabase/redux";
import { toggleNavbar } from "metabase/redux/app";
import { useLocation, useParams } from "metabase/router";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { ActionIcon, Flex, Group, Icon, Menu, Tooltip } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

/** Below this header width, search, +New and the toggle fold into a menu. */
const COMPACT_WIDTH = 300;

/**
 * PROTOTYPE: top of the main nav in the "No top nav" variant. It takes over
 * the app bar's logo, search and +New, plus the sidebar toggle. Chat with
 * Metabot moves into page headers (see `PageMetabotButton`).
 */
export function NoTopNavHeader() {
  const dispatch = useDispatch();
  const location = useLocation();
  const params = useParams();
  const collectionId =
    useInitialCollectionId({ location, params }) ?? undefined;
  const isSearchVisible = useSelector(getIsSearchVisible);
  const isNewButtonVisible = useSelector(getIsNewButtonVisible);
  const { query: kbarQuery } = useKBar();
  const applicationName = useSelector(getApplicationName);
  const { ref, width } = useElementSize();
  const isCompact = width > 0 && width < COMPACT_WIDTH;

  const handleToggle = () => dispatch(toggleNavbar());
  const openSearch = () => kbarQuery.setVisualState(VisualState.showing);
  // The app bar's toggle owns this shortcut, and the app bar is gone here.
  // The nav stays mounted while closed, so this keeps working to reopen it.
  useRegisterShortcut([{ id: "toggle-navbar", perform: handleToggle }]);

  return (
    <Flex
      ref={ref}
      align="center"
      justify="space-between"
      gap="sm"
      h={APP_BAR_HEIGHT}
      px="lg"
      pos="sticky"
      top={0}
      bg="background_page-primary"
      style={{ zIndex: 1, flexShrink: 0 }}
    >
      <Group gap="xxs" wrap="nowrap" miw={0}>
        <AppBarLogo isLogoVisible isNavBarEnabled isSmallAppBar />
        <SpaceSwitcherHeading label={applicationName} />
      </Group>
      {isCompact ? (
        <OverflowMenu
          collectionId={collectionId}
          isSearchVisible={isSearchVisible}
          isNewButtonVisible={isNewButtonVisible}
          onSearch={openSearch}
          onCloseSidebar={handleToggle}
        />
      ) : (
        <Group gap="xs" wrap="nowrap">
          {isSearchVisible && (
            <Tooltip label={t`Search`}>
              <ActionIcon
                variant="subtle"
                aria-label={t`Search`}
                onClick={openSearch}
              >
                <Icon name="search" />
              </ActionIcon>
            </Tooltip>
          )}
          {isNewButtonVisible && (
            <NewItemMenu
              collectionId={collectionId}
              // The nav's AI conversations tab replaces the AI exploration item.
              hideAIExploration
              trigger={
                <Tooltip label={t`New`}>
                  <ActionIcon
                    variant="subtle"
                    aria-label={t`New`}
                    onClick={() => trackAppNewButtonClicked()}
                  >
                    <Icon name="add" />
                  </ActionIcon>
                </Tooltip>
              }
            />
          )}
          <NavToggleActionIcon isNavbarOpen onToggle={handleToggle} />
        </Group>
      )}
    </Flex>
  );
}

/**
 * PROTOTYPE: a narrow nav's stand-in for search, +New and the sidebar toggle —
 * one "…" menu with Search, the +New options under a "New" label, and
 * Close sidebar.
 */
function OverflowMenu({
  collectionId,
  isSearchVisible,
  isNewButtonVisible,
  onSearch,
  onCloseSidebar,
}: {
  collectionId: CollectionId | undefined;
  isSearchVisible: boolean;
  isNewButtonVisible: boolean;
  onSearch: () => void;
  onCloseSidebar: () => void;
}) {
  const trigger = (
    <ActionIcon variant="subtle" aria-label={t`More`}>
      <Icon name="ellipsis" />
    </ActionIcon>
  );
  const itemsBefore = isSearchVisible && (
    <>
      <Menu.Item leftSection={<Icon name="search" />} onClick={onSearch}>
        {t`Search`}
      </Menu.Item>
      <Menu.Divider />
    </>
  );
  const itemsAfter = (
    <>
      <Menu.Divider />
      <Menu.Item
        leftSection={<Icon name="sidebar_closed" />}
        onClick={onCloseSidebar}
      >
        {t`Close sidebar`}
      </Menu.Item>
    </>
  );

  if (isNewButtonVisible) {
    return (
      <NewItemMenu
        collectionId={collectionId}
        // The nav's AI conversations tab replaces the AI exploration item.
        hideAIExploration
        trigger={trigger}
        itemsBefore={itemsBefore}
        itemsLabel={t`New`}
        itemsAfter={itemsAfter}
      />
    );
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>{trigger}</Menu.Target>
      <Menu.Dropdown>
        {isSearchVisible && (
          <Menu.Item leftSection={<Icon name="search" />} onClick={onSearch}>
            {t`Search`}
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<Icon name="sidebar_closed" />}
          onClick={onCloseSidebar}
        >
          {t`Close sidebar`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
