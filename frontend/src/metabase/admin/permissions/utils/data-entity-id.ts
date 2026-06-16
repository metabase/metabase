import { checkNotNull } from "metabase/utils/types";
import type Database from "metabase-lib/v1/metadata/Database";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";
import type {
  ConcreteTableId,
  DatabaseEntityId,
  PermissionEntityId,
  SchemaEntityId,
  TableEntityId,
} from "metabase-types/api";

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
