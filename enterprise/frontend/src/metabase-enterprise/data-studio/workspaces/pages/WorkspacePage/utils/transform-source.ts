import type { DatabaseId, DraftTransformSource } from "metabase-types/api";

/**
 * Extracts the database ID from a transform source, falling back to the provided default.
 */
export function getDatabaseIdFromSource(
  source: DraftTransformSource,
  fallbackDatabaseId: DatabaseId | null | undefined,
): DatabaseId | null | undefined {
  if (source.type === "query") {
    return source.query.database ?? fallbackDatabaseId ?? null;
  }
  if (source.type === "python") {
    return source["source-database"] ?? fallbackDatabaseId ?? undefined;
  }
  return fallbackDatabaseId ?? null;
}

/**
 * Creates a new source with the database ID properly set.
 */
export function setDatabaseIdOnSource(
  source: DraftTransformSource,
  databaseId: DatabaseId | null | undefined,
): DraftTransformSource {
  if (source.type === "python") {
    return {
      ...source,
      "source-database": databaseId ?? undefined,
    };
  }
  if (source.type === "query") {
    return {
      ...source,
      query: {
        ...source.query,
        database: databaseId ?? null,
      },
    };
  }
  return source;
}
