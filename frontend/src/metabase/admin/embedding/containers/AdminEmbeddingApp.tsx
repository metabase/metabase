import type { Location } from "history";

import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

import { EmbeddingNav } from "../components/EmbeddingNav";

const SIDEBAR_HIDDEN_PATHS = new Set([
  "/admin/embedding/setup-guide/permissions",
  "/admin/embedding/setup-guide/sso",
]);

const SIDEBAR_HIDDEN_PATH_PREFIXES = ["/admin/embedding/themes/"];
const FULL_WIDTH_PATH_PREFIXES = ["/admin/embedding/themes/"];

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

  const isFullWidth = FULL_WIDTH_PATH_PREFIXES.some((prefix) =>
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
