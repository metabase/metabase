import { AppBarToggle } from "metabase/nav/components/AppBar";
import { NAV_TOGGLE_INSET } from "metabase/nav/constants";
import { useDispatch } from "metabase/redux";
import { toggleNavbar } from "metabase/redux/app";
import { Box } from "metabase/ui";

import S from "./CollapsedNavbarToggle.module.css";

/**
 * Sidebar toggle floating over the top-left of the main content while the
 * main navigation is collapsed, at the same spot it occupies in the expanded
 * sidebar header.
 */
export function CollapsedNavbarToggle() {
  const dispatch = useDispatch();

  return (
    <Box
      className={S.toggle}
      pl={NAV_TOGGLE_INSET}
      pr="md"
      data-testid="collapsed-navbar-toggle"
    >
      <AppBarToggle
        isNavBarEnabled
        isNavBarOpen={false}
        onToggleClick={() => dispatch(toggleNavbar())}
      />
    </Box>
  );
}
