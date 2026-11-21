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
import { ActionIcon, Flex, Group, Icon, Tooltip } from "metabase/ui";

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

  const handleToggle = () => dispatch(toggleNavbar());
  // The app bar's toggle owns this shortcut, and the app bar is gone here.
  // The nav stays mounted while closed, so this keeps working to reopen it.
  useRegisterShortcut([{ id: "toggle-navbar", perform: handleToggle }]);

  return (
    <Flex
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
      <Group gap="xs" wrap="nowrap">
        {isSearchVisible && (
          <Tooltip label={t`Search`}>
            <ActionIcon
              variant="subtle"
              aria-label={t`Search`}
              onClick={() => kbarQuery.setVisualState(VisualState.showing)}
            >
              <Icon name="search" />
            </ActionIcon>
          </Tooltip>
        )}
        {isNewButtonVisible && (
          <NewItemMenu
            collectionId={collectionId}
            // The nav's Ask AI tab replaces the menu's AI exploration item.
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
    </Flex>
  );
}
