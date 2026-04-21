import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";

import { MetabotNavPane } from "./MetabotNavPane";

export const MetabotAdminLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <AdminSettingsLayout sidebar={<MetabotNavPane />}>
    <ErrorBoundary>{children}</ErrorBoundary>
  </AdminSettingsLayout>
);
