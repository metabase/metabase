import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Markdown } from "metabase/common/components/Markdown";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { isDashboardCacheable } from "metabase/dashboard/utils";
import { PLUGIN_CACHING } from "metabase/plugins";
import { Box, Card, Stack, Text } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Dashboard } from "metabase-types/api";

import { InfoItemSection } from "../../../../components/InfoItemSection";
import { InfoStatSection } from "../../../../components/InfoStatSection";
import { getLoadingTimeMs } from "../utils";

import { AutoApplyFiltersStat } from "./AutoApplyFiltersStat";
import { CachePolicyStat } from "./CachePolicyStat";

type DashboardInfoProps = {
  dashboard: Dashboard;
};

export function DashboardInfo({ dashboard }: DashboardInfoProps) {
  // The API leaves it out for a dashboard without revisions
  const lastEditInfo: Dashboard["last-edit-info"] | undefined =
    dashboard["last-edit-info"];
  const canSeeCachePolicy =
    dashboard.can_set_cache_policy && PLUGIN_CACHING.isGranularCachingEnabled();

  return (
    <Stack gap={0} align="stretch" data-testid="dashboard-info">
      <Box p="xl">
        {dashboard.description ? (
          <Markdown>{dashboard.description}</Markdown>
        ) : (
          <Text c="text-secondary">{t`No description`}</Text>
        )}
      </Box>
      <Card mx="xl" bg="background_page-secondary" shadow="none" radius="lg">
        {lastEditInfo && (
          <InfoItemSection
            icon="pencil"
            value={<DateTime value={lastEditInfo.timestamp} />}
            label={t`Last edited by ${getUserName(lastEditInfo)}`}
          />
        )}
        {dashboard.creator && (
          <InfoItemSection
            icon="person"
            value={getUserName(dashboard.creator)}
            label={t`Owner`}
          />
        )}
      </Card>
      <Card mx="xl" my="xl" shadow="none">
        <LoadingTimeStat dashboard={dashboard} />
        {canSeeCachePolicy && isDashboardCacheable(dashboard) && (
          <CachePolicyStat dashboard={dashboard} />
        )}
        <AutoApplyFiltersStat dashboard={dashboard} />
      </Card>
    </Stack>
  );
}

type LoadingTimeStatProps = {
  dashboard: Pick<Dashboard, "dashcards">;
};

function LoadingTimeStat({ dashboard }: LoadingTimeStatProps) {
  const formatNumber = useNumberFormatter({ decimals: 1 });
  const loadingTimeMs = getLoadingTimeMs(dashboard);

  if (loadingTimeMs == null) {
    return null;
  }

  return (
    <InfoStatSection
      label={t`Avg loading time (s)`}
      value={formatNumber(loadingTimeMs / 1000)}
    />
  );
}
