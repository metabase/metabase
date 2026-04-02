import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { MetabotNavPane } from "metabase/metabot/components/MetabotAdmin/MetabotNavPane";
import { Stack } from "metabase/ui";

export const MetabotStatsLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <AdminSettingsLayout sidebar={<MetabotNavPane />} maw="62rem">
    <ErrorBoundary>
      <Stack gap="lg">{children}</Stack>
    </ErrorBoundary>
  </AdminSettingsLayout>
);
