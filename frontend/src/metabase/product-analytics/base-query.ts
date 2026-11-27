import * as Lib from "metabase-lib";
import type { DatasetQuery, TableId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

/** A query on the table with nothing added. Throws when the table isn't in the metadata provider. */
export const getTableQuery = (
  metadataProvider: Lib.MetadataProvider,
  tableId: TableId,
): Lib.Query => {
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, tableId);
  if (tableMetadata === null) {
    throw new Error(`No metadata for table ${tableId}`);
  }
  return Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata);
};

/**
 * A stored base query, read with the metadata provider. `null` when Lib can't
 * read it, or when it doesn't have exactly one stage.
 */
export const readBaseQuery = (
  metadataProvider: Lib.MetadataProvider,
  value: unknown,
): Lib.Query | null => {
  if (!isObject(value)) {
    return null;
  }
  try {
    // Lib checks the query as it reads it, and throws when it can't.
    const query = Lib.fromJsQuery(metadataProvider, value as DatasetQuery);
    return Lib.stageCount(query) === 1 ? query : null;
  } catch {
    return null;
  }
};
