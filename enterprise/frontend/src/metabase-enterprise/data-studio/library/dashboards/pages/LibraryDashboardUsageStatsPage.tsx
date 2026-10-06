import { t } from "ttag";

import { Center, Text } from "metabase/ui";

import { LibraryDashboardPage } from "../components/LibraryDashboardPage";

export function LibraryDashboardUsageStatsPage() {
  return (
    <LibraryDashboardPage data-testid="library-dashboard-usage-stats-page">
      {() => (
        <Center flex={1}>
          <Text c="text-secondary">{t`Stats will go here later`}</Text>
        </Center>
      )}
    </LibraryDashboardPage>
  );
}
