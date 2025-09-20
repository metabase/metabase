import type { Location } from "history";

import { isNotNull } from "metabase/lib/types";
import type { RunListParams } from "metabase-enterprise/transforms/types";
import type {
  TransformRunMethod,
  TransformRunStatus,
} from "metabase-types/api";

export function getParsedParams(location: Location): RunListParams {
  const {
    page,
    statuses,
    transformIds,
    transformTagIds,
    startTime,
    endTime,
    runMethods,
  } = location.query;
  return {
    page: parseNumber(page),
    statuses: parseList(statuses, parseStatus),
    transformIds: parseList(transformIds, parseNumber),
    transformTagIds: parseList(transformTagIds, parseNumber),
    startTime: parseTime(startTime),
    endTime: parseTime(endTime),
    runMethods: parseList(runMethods, parseMethod),
  };
}

function parseNumber(value: unknown) {
  return typeof value === "string" ? parseInt(value, 10) : undefined;
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

function parseStatus(value: unknown): TransformRunStatus | undefined {
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

function parseTime(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function parseMethod(value: unknown): TransformRunMethod | undefined {
  switch (value) {
    case "manual":
    case "cron":
      return value;
  }
  return undefined;
}

export function hasFilterParams(params: RunListParams) {
  return (
    params.statuses != null ||
    params.transformIds != null ||
    params.transformTagIds != null ||
    params.startTime != null ||
    params.endTime != null ||
    params.runMethods != null
  );
}
