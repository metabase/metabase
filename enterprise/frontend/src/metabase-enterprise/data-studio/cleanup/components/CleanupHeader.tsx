import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { msgid, ngettext, t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { Alert, Button, Group, Icon, Stack, Text } from "metabase/ui";
import type {
  UsageMetadataRefreshStatus,
  UsageMetadataSnapshot,
} from "metabase-types/api";

dayjs.extend(relativeTime);

type CleanupHeaderProps = {
  snapshot?: UsageMetadataSnapshot | null;
  refreshStatus?: UsageMetadataRefreshStatus;
  isRefreshing: boolean;
  isStarting: boolean;
  onRefresh: () => void;
};

export function CleanupHeader({
  snapshot,
  refreshStatus,
  isRefreshing,
  isStarting,
  onRefresh,
}: CleanupHeaderProps) {
  const effectiveFinishedAt =
    snapshot?.finished_at ?? refreshStatus?.snapshot?.finished_at;
  const hasNewerFailure =
    refreshStatus?.failure != null &&
    (refreshStatus.snapshot == null ||
      refreshStatus.failure.id > refreshStatus.snapshot.id);

  return (
    <Stack gap="sm">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Cleanup`}</DataStudioBreadcrumbs>
        }
        actions={
          <Group gap="sm">
            {snapshot?.summary && (
              <Text c="text-secondary" size="sm">
                {ngettext(
                  msgid`${snapshot.summary.table_count} table with recommendations`,
                  `${snapshot.summary.table_count} tables with recommendations`,
                  snapshot.summary.table_count,
                )}
              </Text>
            )}
            {effectiveFinishedAt && (
              <Text c="text-secondary" size="sm">
                {t`Analyzed ${dayjs(effectiveFinishedAt).fromNow()}`}
              </Text>
            )}
            <Button
              aria-label={
                snapshot || refreshStatus?.snapshot
                  ? t`Refresh analysis`
                  : t`Analyze instance`
              }
              leftSection={<Icon name="refresh" />}
              loading={isStarting}
              onClick={onRefresh}
            >
              {snapshot || refreshStatus?.snapshot
                ? t`Refresh analysis`
                : t`Analyze instance`}
            </Button>
          </Group>
        }
        py={0}
      />
      {isRefreshing && (
        <Alert icon={<Icon name="sync" />} color="core-brand">
          {t`Analyzing saved questions and models. Existing results remain available while this runs.`}
        </Alert>
      )}
      {hasNewerFailure && !isRefreshing && (
        <Alert icon={<Icon name="warning" />} color="warning">
          {refreshStatus.snapshot
            ? t`The latest analysis failed. Showing the previous successful results.`
            : t`The analysis failed. Try refreshing it again.`}
        </Alert>
      )}
    </Stack>
  );
}
