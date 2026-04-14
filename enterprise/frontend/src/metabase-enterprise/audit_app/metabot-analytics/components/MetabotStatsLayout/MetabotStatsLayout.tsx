import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { MetabotNavPane } from "metabase/metabot/components/MetabotAdmin/MetabotNavPane";
import { Box } from "metabase/ui";

export const MetabotStatsLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <AdminSettingsLayout sidebar={<MetabotNavPane />} fullWidth>
    <Box py="lg" px="xl" maw="100rem">
      <ErrorBoundary>{children}</ErrorBoundary>
    </Box>
  </AdminSettingsLayout>
);
