import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

import { MetabotNavPane } from "./MetabotNavPane";

export const MetabotAdminLayout = ({
  children,
  fullWidth,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
}) => (
  <AdminSettingsLayout sidebar={<MetabotNavPane />} fullWidth={fullWidth}>
    <ErrorBoundary>{children}</ErrorBoundary>
  </AdminSettingsLayout>
);
