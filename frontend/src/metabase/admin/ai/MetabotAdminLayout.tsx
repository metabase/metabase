import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import { Box } from "metabase/ui";

import { MetabotNavPane } from "./MetabotNavPane";

export const MetabotAdminLayout = ({
  children,
  fullWidth,
  innerContentProps,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
  innerContentProps?: {
    fullWidth?: boolean;
    fullHeight?: boolean;
  };
}) => (
  <AdminSettingsLayout sidebar={<MetabotNavPane />} fullWidth={fullWidth}>
    <ErrorBoundary>
      {fullWidth ? (
        <Box
          py={innerContentProps?.fullHeight ? 0 : "lg"}
          px={innerContentProps?.fullWidth ? 0 : "xl"}
          maw={innerContentProps?.fullWidth ? undefined : "100rem"}
          h={innerContentProps?.fullHeight ? "100%" : undefined}
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
