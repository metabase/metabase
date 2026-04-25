import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";

import { MetabotNavPane } from "./MetabotNavPane";

const METABOT_SETTINGS_PATHS = new Set([
  "/admin/metabot",
  `/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}`,
  `/admin/metabot/${FIXED_METABOT_IDS.EMBEDDED}`,
]);

const shouldScrollToTopOnPathChange = (
  previousPathname: string | undefined,
  nextPathname: string | undefined,
) =>
  !(
    previousPathname != null &&
    nextPathname != null &&
    METABOT_SETTINGS_PATHS.has(previousPathname) &&
    METABOT_SETTINGS_PATHS.has(nextPathname)
  );

export const MetabotAdminLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <AdminSettingsLayout
    sidebar={<MetabotNavPane />}
    shouldScrollToTopOnPathChange={shouldScrollToTopOnPathChange}
  >
    <ErrorBoundary>{children}</ErrorBoundary>
  </AdminSettingsLayout>
);
