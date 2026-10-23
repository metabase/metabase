import { type ReactNode, useId, useMemo } from "react";
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
import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/common/hooks";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { dayjs } from "metabase/dayjs";
import { NameDescriptionInput } from "metabase/metadata/components";
import { PLUGIN_METADATA_GENERATION } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { Button, Ellipsified, Group, Icon, Stack, Text } from "metabase/ui";
import { DAY_OF_WEEK_OPTIONS } from "metabase/utils/date-time";
import { isSyncInProgress } from "metabase/utils/syncing";
import type {
  Database,
  DatabaseId,
  ScheduleSettings,
  Table,
} from "metabase-types/api";

import { TableSectionGroup } from "../TableSection/TableSectionGroup";

const NAME_MAX_LENGTH = 254;

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
  const lastUpdatedAt = useMemo(() => getLastUpdatedAt(tables), [tables]);

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
    <Stack gap="lg" pb="xxl" data-testid="database-section">
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

      <TableSectionGroup
        title={t`Syncing`}
        actions={
          <Button
            size="compact-md"
            leftSection={<Icon name="sync" />}
            loading={isSyncing}
            onClick={handleSync}
          >
            {t`Sync now`}
          </Button>
        }
      >
        <Stack gap="lg" data-testid="database-syncing-section">
          <MetadataRow
            label={t`Last metadata update`}
            value={getLastUpdatedValue(database, lastUpdatedAt)}
          />
          <MetadataRow
            label={t`Schedule`}
            value={getScheduleLabel(database.schedules?.metadata_sync)}
          />
        </Stack>
      </TableSectionGroup>

      <TableSectionGroup title={t`Stats`}>
        <Stack gap="lg" data-testid="database-stats-section">
          <MetadataRow label={t`Schemas`} value={formatNumber(stats.schemas)} />
          <MetadataRow label={t`Tables`} value={formatNumber(stats.tables)} />
          <MetadataRow label={t`Fields`} value={formatNumber(stats.fields)} />
          <MetadataRow
            label={t`Rows`}
            value={
              stats.rows != null
                ? formatNumber(stats.rows, { compact: true })
                : t`Unknown`
            }
          />
        </Stack>
      </TableSectionGroup>
    </Stack>
  );
}

type MetadataRowProps = {
  label: string;
  value: ReactNode;
};

function MetadataRow({ label, value }: MetadataRowProps) {
  const id = useId();
  return (
    <Group justify="space-between" gap="xl" wrap="nowrap">
      <Text size="md" c="text-primary" id={id} flex="1 0 auto">
        {label}
      </Text>
      <Ellipsified
        size="md"
        c="text-primary"
        aria-labelledby={id}
        tooltipProps={{ maw: "unset" }}
      >
        {value}
      </Ellipsified>
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

/** The most recent update of a table of the database: a sync, a rename or a metadata edit. */
function getLastUpdatedAt(tables: Table[]): string | null {
  return tables.reduce<string | null>((latest, table) => {
    if (table.updated_at == null) {
      return latest;
    }
    return latest == null || table.updated_at > latest
      ? table.updated_at
      : latest;
  }, null);
}

function getLastUpdatedValue(
  database: Database,
  lastUpdatedAt: string | null,
): ReactNode {
  if (isSyncInProgress(database)) {
    return t`Syncing…`;
  }
  if (lastUpdatedAt == null) {
    return t`Never`;
  }
  return <DateTime value={lastUpdatedAt} />;
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
      const day = (
        DAY_OF_WEEK_OPTIONS.find(
          (option) => option.value === schedule.schedule_day,
        ) ?? DAY_OF_WEEK_OPTIONS[0]
      ).name;
      return t`Weekly on ${day} at ${time}`;
    }
    case "monthly":
      return t`Monthly at ${time}`;
    default:
      return t`Hourly`;
  }
}
