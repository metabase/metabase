import { t } from "ttag";

import { hasFeature } from "metabase/admin/databases/utils";
import { parseTimestamp } from "metabase/lib/time-dayjs";
import { isNotNull } from "metabase/lib/types";
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
      return t`In progress`;
    case "succeeded":
      return t`Success`;
    case "failed":
      return `Failed`;
    case "timeout":
      return t`Timeout`;
    case "canceling":
      return t`Canceling`;
    case "canceled":
      return t`Canceled`;
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
    !database.router_user_attribute &&
    !database.router_database_id &&
    hasFeature(database, "transforms/table")
  );
}

export function parseListFromUrl<T>(
  value: unknown,
  parseItem: (value: unknown) => T | undefined,
): T[] | undefined {
  if (typeof value === "string") {
    const item = parseItem(value);
    return item != null ? [item] : [];
  }
  if (Array.isArray(value)) {
    return value.map(parseItem).filter(isNotNull);
  }
  return undefined;
}

export function parseNumberFromUrl(value: unknown) {
  return typeof value === "string" ? parseFloat(value) : undefined;
}

export function parseStringFromUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

export function parseRunStatusFromUrl(
  value: unknown,
): TransformRunStatus | undefined {
  switch (value) {
    case "started":
    case "succeeded":
    case "failed":
    case "timeout":
      return value;
    default:
      return undefined;
  }
}

export function parseRunMethodFromUrl(
  value: unknown,
): TransformRunMethod | undefined {
  switch (value) {
    case "manual":
    case "cron":
      return value;
  }
  return undefined;
}
