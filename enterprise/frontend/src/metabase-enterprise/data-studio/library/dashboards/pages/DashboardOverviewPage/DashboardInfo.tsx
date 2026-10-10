import type { ReactNode } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { DateTime } from "metabase/common/components/DateTime";
import { Markdown } from "metabase/common/components/Markdown";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { PLUGIN_CACHING } from "metabase/plugins";
import { Box, Card, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import { checkNumber } from "metabase/utils/types";
import { getUserName } from "metabase/utils/user";
import type {
  CacheableModel,
  Dashboard,
  DashboardId,
  IconName,
} from "metabase-types/api";

import { getLoadingTimeMs } from "./utils";

type DashboardInfoProps = {
  dashboard: Dashboard;
};

export function DashboardInfo({ dashboard }: DashboardInfoProps) {
  // The endpoint omits last-edit-info for a dashboard with no revisions
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
        {canSeeCachePolicy && <CachePolicyStat dashboardId={dashboard.id} />}
        <DashboardStat
          label={t`Auto-apply filters`}
          value={dashboard.auto_apply_filters ? t`On` : t`Off`}
        />
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

type DashboardStatProps = {
  label: string;
  value: ReactNode;
};

function DashboardStat({ label, value }: DashboardStatProps) {
  return (
    <Card.Section withBorder py="md" px="lg">
      <Flex justify="space-between" align="center" gap="md">
        <Text size="md" c="text-secondary">
          {label}
        </Text>
        <Text size="md" fw={600}>
          {value}
        </Text>
      </Flex>
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

type CachePolicyStatProps = {
  dashboardId: DashboardId;
};

const CACHE_CONFIG_MODELS: CacheableModel[] = ["dashboard"];

function CachePolicyStat({ dashboardId }: CachePolicyStatProps) {
  const id = checkNumber(dashboardId);
  const { configs, isLoading, error } = useCacheConfigs({
    model: CACHE_CONFIG_MODELS,
    id,
  });

  if (isLoading) {
    return null;
  }

  if (error != null) {
    return (
      <DashboardStat label={t`Caching policy`} value={t`Failed to load`} />
    );
  }

  const config = _.findWhere(configs ?? [], {
    model: "dashboard",
    model_id: id,
  });

  return (
    <DashboardStat
      label={t`Caching policy`}
      value={getShortStrategyLabel(config?.strategy, "dashboard") ?? t`Default`}
    />
  );
}
