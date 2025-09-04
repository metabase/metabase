import { t } from "ttag";

import { hasFeature } from "metabase/admin/databases/utils";
import { parseTimestamp } from "metabase/lib/time-dayjs";
import type {
  Database,
  TransformRunMethod,
  TransformRunStatus,
} from "metabase-types/api";

export function parseTimestampWithTimezone(
  timestamp: string,
  systemTimezone: string | undefined,
) {
  const date = parseTimestamp(timestamp);
  if (systemTimezone == null) {
    return date;
  }
  try {
    return date.tz(systemTimezone);
  } catch {
    return date;
  }
}

export function formatStatus(status: TransformRunStatus) {
  switch (status) {
    case "started":
      return t`In-progress`;
    case "succeeded":
      return t`Success`;
    case "failed":
      return `Failed`;
    case "timeout":
      return t`Timeout`;
  }
}

export function formatRunMethod(trigger: TransformRunMethod) {
  switch (trigger) {
    case "manual":
      return t`Manual`;
    case "cron":
      return t`Schedule`;
  }
}

export function doesDatabaseSupportTransforms(database?: Database): boolean {
  if (!database) {
    return false;
  }

  return (
    !database.is_sample &&
    !database.is_audit &&
    hasFeature(database, "transforms/table")
  );
}
