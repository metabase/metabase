import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { isDashboardCacheable } from "metabase/dashboard/utils";
import { PLUGIN_CACHING } from "metabase/plugins";
import { Box, Card, Group, Icon, Stack, Text } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Dashboard, IconName } from "metabase-types/api";

import { getLoadingTimeMs } from "../utils";

import { AutoApplyFiltersStat } from "./AutoApplyFiltersStat";
import { CachePolicyStat } from "./CachePolicyStat";
import { DashboardDescription } from "./DashboardDescription";
import { DashboardStat } from "./DashboardStat";

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
        <DashboardDescription dashboard={dashboard} />
      </Box>
      <Card mx="xl" bg="background_page-secondary" shadow="none" radius="lg">
        {lastEditInfo && (
          <DashboardInfoItem
            icon="pencil"
            value={<DateTime value={lastEditInfo.timestamp} />}
            label={t`Last edited by ${getUserName(lastEditInfo)}`}
          />
        )}
        {dashboard.creator && (
          <DashboardInfoItem
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

type DashboardInfoItemProps = {
  icon: IconName;
  value: ReactNode;
  label: string;
};

function DashboardInfoItem({ icon, value, label }: DashboardInfoItemProps) {
  return (
    <Card.Section withBorder p="lg">
      <Group gap="sm" mb="xxs" wrap="nowrap">
        <Icon name={icon} c="core-brand" />
        <Text size="md" fw={600} lh="1rem">
          {value}
        </Text>
      </Group>
      <Text size="sm" c="text-secondary" lh="1rem" ml="xl">
        {label}
      </Text>
    </Card.Section>
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
    <DashboardStat
      label={t`Avg loading time (s)`}
      value={formatNumber(loadingTimeMs / 1000)}
    />
  );
}
