import { checkNotNull } from "metabase/core/utils/types";
import type { ConcreteTableId } from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";
import type Schema from "metabase-lib/metadata/Schema";
import type Table from "metabase-lib/metadata/Table";
import type { EntityId, PermissionSubject } from "../types";

export const getDatabaseEntityId = (databaseEntity: Database) => ({
  databaseId: databaseEntity.id,
});

export const getSchemaEntityId = (schemaEntity: Schema) => ({
  databaseId: checkNotNull(schemaEntity.database).id,
  schemaName: schemaEntity.name,
});

export const getTableEntityId = (tableEntity: Table) => ({
  databaseId: tableEntity.db_id,
  schemaName: tableEntity.schema_name,
  tableId: tableEntity.id as ConcreteTableId,
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
