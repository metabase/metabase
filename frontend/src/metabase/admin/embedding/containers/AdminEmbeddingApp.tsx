import type { Location } from "history";

import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";

import { EmbeddingNav } from "../components/EmbeddingNav";

const SIDEBAR_HIDDEN_PATHS = new Set([
  "/admin/embedding/setup-guide/permissions",
  "/admin/embedding/setup-guide/sso",
]);

export const AdminEmbeddingApp = ({
  location,
  children,
}: {
  location: Location;
  children: React.ReactNode;
}) => {
  const shouldHideSidebar = SIDEBAR_HIDDEN_PATHS.has(location.pathname);

  return (
    <AdminSettingsLayout
      sidebar={shouldHideSidebar ? undefined : <EmbeddingNav />}
    >
      {children}
    </AdminSettingsLayout>
  );
};
