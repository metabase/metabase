import Database from "metabase-lib/lib/metadata/Database";
import Schema from "metabase-lib/lib/metadata/Schema";
import Table from "metabase-lib/lib/metadata/Table";
import { EntityId, PermissionSubject } from "../types";

export const getDatabaseEntityId = (databaseEntity: Database) => ({
  databaseId: databaseEntity.id,
});

export const getSchemaEntityId = (schemaEntity: Schema) => ({
  databaseId: schemaEntity.database.id,
  schemaName: schemaEntity.name,
});

export const getTableEntityId = (tableEntity: Table) => ({
  databaseId: tableEntity.db_id,
  schemaName: tableEntity.schema_name,
  tableId: tableEntity.id,
});

export const isTableEntityId = (entityId: Partial<EntityId>) =>
  entityId.tableId != null;
export const isSchemaEntityId = (entityId: Partial<EntityId>) =>
  entityId.schemaName != null && !isTableEntityId(entityId);
export const isDatabaseEntityId = (entityId: Partial<EntityId>) =>
  entityId.databaseId != null &&
  !isSchemaEntityId(entityId) &&
  !isTableEntityId(entityId);

export const getPermissionSubject = (
  entityId: Partial<EntityId>,
  hasSingleSchema?: boolean,
): PermissionSubject => {
  if (isTableEntityId(entityId)) {
    return "fields";
  }

  if (isSchemaEntityId(entityId) || hasSingleSchema) {
    return "tables";
  }

  return "schemas";
};
