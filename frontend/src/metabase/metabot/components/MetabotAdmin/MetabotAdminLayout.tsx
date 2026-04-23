import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Box } from "metabase/ui";

import { MetabotNavPane } from "./MetabotNavPane";

export const MetabotAdminLayout = ({
  children,
  fullWidth,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
}) => (
  <AdminSettingsLayout sidebar={<MetabotNavPane />} fullWidth={fullWidth}>
    <ErrorBoundary>
      {fullWidth ? (
        <Box py="lg" px="xl" maw="100rem">
          {children}
        </Box>
      ) : (
        children
      )}
    </ErrorBoundary>
  </AdminSettingsLayout>
);
