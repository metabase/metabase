import type { Location } from "history";

import { isNotNull } from "metabase/lib/types";
import type { RunListParams } from "metabase-enterprise/transforms/types";
import type { TransformRunStatus } from "metabase-types/api";

export function getParsedParams(location: Location): RunListParams {
  const { page, statuses, transformIds, transformTagIds } = location.query;
  return {
    page: parseNumber(page),
    statuses: parseList(statuses, parseStatus),
    transformIds: parseList(transformIds, parseNumber),
    transformTagIds: parseList(transformTagIds, parseNumber),
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
