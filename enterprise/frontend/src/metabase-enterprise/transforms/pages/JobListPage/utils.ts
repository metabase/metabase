import type { Location } from "history";

import { isNotNull } from "metabase/lib/types";
import type { JobListParams } from "metabase-enterprise/transforms/types";

export function getParsedParams(location: Location): JobListParams {
  const { transformTagIds, lastRunStartTime, nextRunStartTime } =
    location.query;

  return {
    lastRunStartTime: parseTime(lastRunStartTime),
    nextRunStartTime: parseTime(nextRunStartTime),
    transformTagIds: parseList(transformTagIds, parseNumber),
  };
}

function parseTime(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function parseList<T>(
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
}

function parseNumber(value: unknown) {
  return typeof value === "string" ? parseInt(value, 10) : undefined;
}

export function hasFilterParams(params: JobListParams) {
  return (
    params.lastRunStartTime != null ||
    params.nextRunStartTime != null ||
    params.transformTagIds != null
  );
}
