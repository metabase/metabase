import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Box } from "metabase/ui";

import { MetabotNavPane } from "./MetabotNavPane";

export const MetabotAdminLayout = ({
  children,
  fullWidth,
  fullHeight,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
  fullHeight?: boolean;
}) => (
  <AdminSettingsLayout sidebar={<MetabotNavPane />} fullWidth={fullWidth}>
    <ErrorBoundary>
      {fullWidth ? (
        <Box
          py={fullWidth ? 0 : "lg"}
          px={fullWidth ? 0 : "xl"}
          maw={fullWidth ? undefined : "100rem"}
          h={fullHeight ? "100%" : undefined}
          mx="auto"
        >
          {children}
        </Box>
      ) : (
        children
      )}
    </ErrorBoundary>
  </AdminSettingsLayout>
);
