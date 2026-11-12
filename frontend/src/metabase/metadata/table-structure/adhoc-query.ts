import type { DatabaseId, JsonQuery } from "metabase-types/api";

/** A legacy MBQL query, written by hand for the prototype's profiling */
export type AdhocMbqlQuery = {
  database: DatabaseId;
  type: "query";
  query: Record<string, unknown>;
};

/**
 * PROTOTYPE: /api/dataset still runs legacy MBQL, but the app's query types
 * are opaque, so a hand-written one is passed through as is
 */
export const legacyQuery = (query: AdhocMbqlQuery): JsonQuery =>
  query as unknown as JsonQuery;
