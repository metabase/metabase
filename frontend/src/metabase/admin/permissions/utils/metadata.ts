import _ from "underscore";

import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type Table from "metabase-lib/v1/metadata/Table";
import type { ConcreteTableId } from "metabase-types/api";

import type { TableEntityId } from "../types";

export const getDatabase = (metadata: Metadata, databaseId: number) => {
  const database = metadata.database(databaseId);

  if (!database) {
    throw new Error(`Missing metadata for database with id ${databaseId}`);
  }

  return database;
};

export const metadataTableToTableEntityId = (table: Table) => ({
  databaseId: table.db_id,
  schemaName: table.schema_name || "",
  tableId: table.id as ConcreteTableId,
});

// TODO Atte Keinänen 6/24/17 See if this method could be simplified
export const entityIdToMetadataTableFields = (
  entityId: Partial<TableEntityId>,
) => ({
  ...(entityId.databaseId ? { db_id: entityId.databaseId } : {}),
  // Because schema name can be an empty string, which means an empty schema, this check becomes a little nasty
  ...(entityId.schemaName !== undefined
    ? { schema_name: entityId.schemaName !== "" ? entityId.schemaName : null }
    : {}),
  ...(entityId.tableId ? { id: entityId.tableId } : {}),
});
