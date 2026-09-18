import type {
  ConcreteTableId,
  Database,
  DatabaseEntityId,
  PermissionEntityId,
  SchemaEntityId,
  Table,
  TableEntityId,
} from "metabase-types/api";

import type { PermissionsSchema } from "./metadata";

export const getDatabaseEntityId = (databaseEntity: Pick<Database, "id">) => ({
  databaseId: databaseEntity.id,
});

export const getSchemaEntityId = (schemaEntity: PermissionsSchema) => ({
  databaseId: schemaEntity.databaseId,
  schemaName: schemaEntity.name,
});

export const getTableEntityId = (tableEntity: Table) => ({
  databaseId: tableEntity.db_id,
  schemaName: tableEntity.schema,
  // A permission entity always names a real warehouse table, never a card.
  tableId: tableEntity.id as ConcreteTableId,
});

export const isTableEntityId = (
  entityId: Partial<PermissionEntityId>,
): entityId is TableEntityId => entityId.tableId != null;

export const isSchemaEntityId = (
  entityId: Partial<PermissionEntityId>,
): entityId is SchemaEntityId & { schemaName: string } =>
  // not sure why schemaName can be undefined on SchemaEntityId
  entityId.schemaName != null &&
  entityId.schemaName !== "" &&
  !isTableEntityId(entityId);

export const isDatabaseEntityId = (
  entityId: Partial<PermissionEntityId>,
): entityId is DatabaseEntityId =>
  entityId.databaseId != null &&
  !isSchemaEntityId(entityId) &&
  !isTableEntityId(entityId);
