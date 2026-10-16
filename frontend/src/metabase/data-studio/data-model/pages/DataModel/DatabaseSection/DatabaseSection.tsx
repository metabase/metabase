import { useMemo } from "react";
import { t } from "ttag";

import {
  tableApi,
  useGetDatabaseQuery,
  useRescanDatabaseFieldValuesMutation,
  useSyncDatabaseSchemaMutation,
  useUpdateDatabaseMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { getErrorMessage } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/common/hooks";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { dayjs } from "metabase/dayjs";
import { NameDescriptionInput } from "metabase/metadata/components";
import { PLUGIN_METADATA_GENERATION } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { Button, Group, Icon, Stack, Text, Title } from "metabase/ui";
import { isSyncInProgress } from "metabase/utils/syncing";
import type {
  Database,
  DatabaseId,
  ScheduleDayType,
  ScheduleSettings,
  Table,
} from "metabase-types/api";

const NAME_MAX_LENGTH = 254;
const WEEK_DAYS: ScheduleDayType[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

type DatabaseSectionProps = {
  databaseId: DatabaseId;
};

export function DatabaseSection({ databaseId }: DatabaseSectionProps) {
  const {
    data: database,
    error,
    isLoading,
  } = useGetDatabaseQuery({ id: databaseId, include: "tables.fields" });

  if (isLoading || error != null || database == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <DatabaseSectionContent key={database.id} database={database} />;
}

type DatabaseSectionContentProps = {
  database: Database;
};

function DatabaseSectionContent({ database }: DatabaseSectionContentProps) {
  const dispatch = useDispatch();
  const formatNumber = useNumberFormatter({ maximumFractionDigits: 0 });
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [updateDatabase] = useUpdateDatabaseMutation();
  const [syncDatabaseSchema, { isLoading: isSyncing }] =
    useSyncDatabaseSchemaMutation();
  const [rescanFieldValues, { isLoading: isRescanning }] =
    useRescanDatabaseFieldValuesMutation();

  const tables = useMemo(() => database.tables ?? [], [database.tables]);
  const stats = useMemo(() => getDatabaseStats(tables), [tables]);
  const lastSyncedAt = useMemo(() => getLastSyncedAt(tables), [tables]);

  const handleNameChange = async (name: string) => {
    const { error } = await updateDatabase({ id: database.id, name });
    if (error) {
      sendErrorToast(t`Failed to update database name`);
    } else {
      sendSuccessToast(t`Database name updated`);
    }
  };

  const handleDescriptionChange = async (description: string) => {
    const { error } = await updateDatabase({ id: database.id, description });
    if (error) {
      sendErrorToast(t`Failed to update database description`);
    } else {
      sendSuccessToast(t`Database description updated`);
    }
  };

  const handleSync = async () => {
    const { error } = await syncDatabaseSchema(database.id);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to start the sync`));
    } else {
      dispatch(tableApi.util.invalidateTags([listTag("table")]));
      sendSuccessToast(t`Sync started`);
    }
  };

  const handleRescan = async () => {
    const { error } = await rescanFieldValues(database.id);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to start the scan`));
    } else {
      sendSuccessToast(t`Field values scan started`);
    }
  };

  return (
    <Stack gap="xl" pb="xxl" data-testid="database-section">
      <NameDescriptionInput
        description={database.description ?? ""}
        descriptionPlaceholder={t`Give this database a description`}
        name={database.name}
        nameIcon="database"
        nameMaxLength={NAME_MAX_LENGTH}
        namePlaceholder={t`Give this database a name`}
        onNameChange={handleNameChange}
        onDescriptionChange={handleDescriptionChange}
      />

      <Group gap="sm">
        <Button
          leftSection={<Icon name="refresh" />}
          loading={isRescanning}
          onClick={handleRescan}
        >
          {t`Re-scan`}
        </Button>
        <PLUGIN_METADATA_GENERATION.DatabaseButton databaseId={database.id} />
      </Group>

      <Stack gap="md" data-testid="database-syncing-section">
        <Group justify="space-between" wrap="nowrap">
          <Title order={4} fw="normal">{t`Syncing`}</Title>
          <Button
            size="sm"
            leftSection={<Icon name="sync" />}
            loading={isSyncing}
            onClick={handleSync}
          >
            {t`Sync now`}
          </Button>
        </Group>
        <DetailRow
          label={t`Last synced`}
          value={getLastSyncedLabel(database, lastSyncedAt)}
        />
        <DetailRow
          label={t`Schedule`}
          value={getScheduleLabel(database.schedules?.metadata_sync)}
        />
      </Stack>

      <Stack gap="md" data-testid="database-stats-section">
        <Title order={4} fw="normal">{t`Stats`}</Title>
        <DetailRow label={t`Schemas`} value={formatNumber(stats.schemas)} />
        <DetailRow label={t`Tables`} value={formatNumber(stats.tables)} />
        <DetailRow label={t`Fields`} value={formatNumber(stats.fields)} />
        <DetailRow
          label={t`Rows`}
          value={
            stats.rows != null
              ? formatNumber(stats.rows, { compact: true })
              : t`Unknown`
          }
        />
      </Stack>
    </Stack>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Text fw="bold">{label}</Text>
      <Text fw="bold" ta="right">
        {value}
      </Text>
    </Group>
  );
}

type DatabaseStats = {
  schemas: number;
  tables: number;
  fields: number;
  rows: number | null;
};

function getDatabaseStats(tables: Table[]): DatabaseStats {
  const schemas = new Set(tables.map((table) => table.schema ?? ""));
  const fields = tables.reduce(
    (count, table) => count + (table.fields?.length ?? 0),
    0,
  );
  const rowCounts = tables
    .map((table) => table.estimated_row_count)
    .filter((count): count is number => count != null);
  const rows =
    rowCounts.length > 0
      ? rowCounts.reduce((total, count) => total + count, 0)
      : null;

  return { schemas: schemas.size, tables: tables.length, fields, rows };
}

/**
 * The API exposes no sync timestamp, so the most recent table update stands
 * in for the last sync.
 */
function getLastSyncedAt(tables: Table[]): string | null {
  return tables.reduce<string | null>((latest, table) => {
    if (table.updated_at == null) {
      return latest;
    }
    return latest == null || table.updated_at > latest
      ? table.updated_at
      : latest;
  }, null);
}

function getLastSyncedLabel(
  database: Database,
  lastSyncedAt: string | null,
): string {
  if (isSyncInProgress(database)) {
    return t`Syncing…`;
  }
  if (lastSyncedAt == null) {
    return t`Never`;
  }
  return dayjs(lastSyncedAt).format("MMM D, h:mm A");
}

function getScheduleLabel(schedule: ScheduleSettings | null | undefined) {
  if (schedule == null) {
    return t`Hourly`;
  }

  const time = dayjs()
    .hour(schedule.schedule_hour ?? 0)
    .minute(schedule.schedule_minute ?? 0)
    .format("h:mm A");

  switch (schedule.schedule_type) {
    case "hourly":
      return t`Hourly`;
    case "daily":
      return t`Daily at ${time}`;
    case "weekly": {
      const dayIndex = WEEK_DAYS.indexOf(schedule.schedule_day ?? "sun");
      const day = dayjs()
        .day(dayIndex >= 0 ? dayIndex : 0)
        .format("dddd");
      return t`Weekly on ${day} at ${time}`;
    }
    case "monthly":
      return t`Monthly at ${time}`;
    default:
      return t`Hourly`;
  }
}
