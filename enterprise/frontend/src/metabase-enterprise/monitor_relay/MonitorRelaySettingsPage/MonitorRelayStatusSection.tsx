import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useAdminSetting } from "metabase/settings";
import { SettingsSection } from "metabase/settings-components";
import { SimpleGrid, Stack, Text } from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import { useGetMonitorRelayStatusQuery } from "metabase-enterprise/api";
import type { MonitorRelayStatus } from "metabase-types/api";

import { STATUS_POLLING_INTERVAL_MS, getPhaseLabel } from "./utils";

export function MonitorRelayStatusSection() {
  const { data, error, isLoading } = useGetMonitorRelayStatusQuery(undefined, {
    pollingInterval: STATUS_POLLING_INTERVAL_MS,
  });
  const { settingDetails, isLoading: isSettingLoading } = useAdminSetting(
    "metabase-monitor-url",
  );

  return (
    <SettingsSection title={t`Status`}>
      <LoadingAndErrorWrapper
        loading={isLoading || isSettingLoading}
        error={data ? null : error}
      >
        {data && (
          <StatusContent status={data} envName={settingDetails?.env_name} />
        )}
      </LoadingAndErrorWrapper>
    </SettingsSection>
  );
}

function StatusContent({
  status,
  envName,
}: {
  status: MonitorRelayStatus;
  envName: string | undefined;
}) {
  const { url, node, feed } = status;

  if (url.status === "unset") {
    return <Text>{t`No URL is set, so this instance sends nothing.`}</Text>;
  }

  if (url.status === "malformed") {
    return (
      <Text>{t`${envName} is not of the form <base>/ingest/<token>, so this instance sends nothing.`}</Text>
    );
  }

  const lastFailure =
    node.last_result?.outcome === "ok" ? undefined : node.last_result?.message;
  const problem = lastFailure ?? feed.error;

  return (
    <Stack>
      {problem && <Text c="feedback-negative">{problem}</Text>}
      {feed.status && (
        <SimpleGrid cols={2}>
          <Fact label={t`Phase`} value={getPhaseLabel(feed.status.phase)} />
          <Fact
            label={t`Last processed`}
            value={
              feed.status.last_seal_at
                ? getRelativeTime(feed.status.last_seal_at)
                : t`Never`
            }
          />
        </SimpleGrid>
      )}
    </Stack>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap="xs">
      <Text c="text-secondary" size="sm">
        {label}
      </Text>
      <Text fw="bold">{value}</Text>
    </Stack>
  );
}
