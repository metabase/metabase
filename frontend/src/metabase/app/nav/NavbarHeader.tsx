import { useInitialCollectionId } from "metabase/common/collections/hooks";
import { MetabotAppBarButton } from "metabase/metabot/components/MetabotAppBarButton";
import { AppBarLogo, AppBarToggle } from "metabase/nav/components/AppBar";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import NewItemButton from "metabase/nav/components/NewItemButton";
import { SearchButton } from "metabase/nav/components/search/SearchButton";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { toggleNavbar } from "metabase/redux/app";
import { useLocation, useParams } from "metabase/router";
import { Box, Flex } from "metabase/ui";

import {
  getIsAppSwitcherVisible,
  getIsLogoVisible,
  getIsNewButtonVisible,
  getIsSearchVisible,
} from "./selectors";

interface NavbarHeaderProps {
  isNavBarOpen: boolean;
}

/**
 * Top of the main navigation sidebar: the sidebar toggle, logo and the global
 * actions (search, new, Metabot, app switcher) that used to live in the app bar.
 */
export function NavbarHeader({ isNavBarOpen }: NavbarHeaderProps) {
  const dispatch = useDispatch();
  const location = useLocation();
  const params = useParams();
  const collectionId =
    useInitialCollectionId({ location, params }) ?? undefined;

  const isLogoVisible = useSelector(getIsLogoVisible);
  const isSearchVisible = useSelector(getIsSearchVisible);
  const isNewButtonVisible = useSelector(getIsNewButtonVisible);
  const isAppSwitcherVisible = useSelector(getIsAppSwitcherVisible);

  return (
    <Box px="md" flex="0 0 auto" data-testid="main-navbar-header">
      <Flex align="center" gap="sm" h={APP_BAR_HEIGHT}>
        {/* The collapsed rail renders the toggle while the sidebar is hidden;
            mounting it only here when open keeps a single shortcut registration. */}
        {isNavBarOpen && (
          <AppBarToggle
            isNavBarEnabled
            isNavBarOpen={isNavBarOpen}
            onToggleClick={() => dispatch(toggleNavbar())}
          />
        )}
        <AppBarLogo isLogoVisible={isLogoVisible} isNavBarEnabled />
        <Flex align="center" gap="sm" ml="auto" flex="0 0 auto">
          {isSearchVisible && <SearchButton />}
          {isNewButtonVisible && <NewItemButton collectionId={collectionId} />}
          <MetabotAppBarButton />
          {isAppSwitcherVisible && <AppSwitcher />}
        </Flex>
      </Flex>
      <Flex miw={0}>
        <PLUGIN_REMOTE_SYNC.GitSyncAppBarControls />
      </Flex>
    </Box>
  );
}
