import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";

const STAGE_INDEX = 0;

export function applyLimit(query: Query, limit: unknown): Query | null {
  if (limit == null) {
    return query;
  }

  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0) {
    return null;
  }

  return Lib.limit(query, STAGE_INDEX, limit);
}
