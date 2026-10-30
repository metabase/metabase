import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import { ADMIN_PERMISSIONS_BASE_PATH } from "metabase/common/components/PermissionsBasePath/base-path";
import { PLUGIN_AI_CONTROLS } from "metabase/plugins";
import { Outlet, useLocation } from "metabase/router";
import { Box } from "metabase/ui";

import { PermissionsNav } from "../PermissionsNav/PermissionsNav";

/** Sections that read like a settings page rather than a full-bleed editor. */
const SETTINGS_PAGE_SECTIONS = ["roles", "data-isolation"];

/** Full-width sections that lay out their own page rather than a permissions grid. */
const SELF_LAID_OUT_SECTIONS = ["mcp-tool-access", "ai-feature-access"];

export function PermissionsAdminLayout() {
  const { pathname } = useLocation();
  const section = pathname
    .slice(ADMIN_PERMISSIONS_BASE_PATH.length)
    .split("/")
    .filter(Boolean)[0];

  // The licensed AI feature access page is a settings page; the upsell in its
  // place wants the whole pane.
  const isSettingsPage =
    SETTINGS_PAGE_SECTIONS.includes(section) ||
    (section === "ai-feature-access" && PLUGIN_AI_CONTROLS.isEnabled);

  return (
    <AdminSettingsLayout
      sidebar={<PermissionsNav />}
      fullWidth={!isSettingsPage}
    >
      {isSettingsPage || SELF_LAID_OUT_SECTIONS.includes(section) ? (
        <Outlet />
      ) : (
        <Box h="100%" bg="background_page-primary">
          <Outlet />
        </Box>
      )}
    </AdminSettingsLayout>
  );
}
