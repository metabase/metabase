import type { Location } from "history";

import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

import { EmbeddingNav } from "../components/EmbeddingNav";

const SIDEBAR_HIDDEN_PATHS = new Set([
  "/admin/embedding/setup-guide/permissions",
  "/admin/embedding/setup-guide/sso",
]);

// routes in this array won't render the embedding sidebar
const SIDEBAR_HIDDEN_PATH_PREFIXES = ["/admin/embedding/themes/"];

// routes in this array will take the full width _of the main content area_
const FULL_CONTENT_WIDTH_PATH_PREFIXES = ["/admin/embedding/themes/"];

export const AdminEmbeddingApp = ({
  location,
  children,
}: {
  location: Location;
  children: React.ReactNode;
}) => {
  const shouldHideSidebar =
    SIDEBAR_HIDDEN_PATHS.has(location.pathname) ||
    SIDEBAR_HIDDEN_PATH_PREFIXES.some((prefix) =>
      location.pathname.startsWith(prefix),
    );

  const isFullWidth = FULL_CONTENT_WIDTH_PATH_PREFIXES.some((prefix) =>
    location.pathname.startsWith(prefix),
  );

  return (
    <AdminSettingsLayout
      sidebar={shouldHideSidebar ? undefined : <EmbeddingNav />}
      fullWidth={isFullWidth}
    >
      {children}
    </AdminSettingsLayout>
  );
};
