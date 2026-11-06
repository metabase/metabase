import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { dayjs } from "metabase/dayjs";
import { isSyncInProgress } from "metabase/utils/syncing";
import type {
  Database,
  ScheduleDayType,
  ScheduleSettings,
  Table,
} from "metabase-types/api";

const WEEK_DAYS: ScheduleDayType[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

type TableStats = {
  schemas: number;
  tables: number;
  fields: number;
  rows: number | null;
};

/** Counts across a set of tables, e.g. a database's or a schema's. */
export function getTableStats(tables: Table[]): TableStats {
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
export function getLastSyncedAt(tables: Table[]): string | null {
  return tables.reduce<string | null>((latest, table) => {
    if (table.updated_at == null) {
      return latest;
    }
    return latest == null || table.updated_at > latest
      ? table.updated_at
      : latest;
  }, null);
}

export function getLastSyncedValue(
  database: Database,
  lastSyncedAt: string | null,
): ReactNode {
  if (isSyncInProgress(database)) {
    return t`Syncing…`;
  }
  if (lastSyncedAt == null) {
    return t`Never`;
  }
  return <DateTime value={lastSyncedAt} />;
}

export function getScheduleLabel(
  schedule: ScheduleSettings | null | undefined,
) {
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
