import { checkNotNull } from "metabase/lib/types";
import type Database from "metabase-lib/v1/metadata/Database";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";
import type { ConcreteTableId } from "metabase-types/api";

import type {
  DatabaseEntityId,
  EntityId,
  SchemaEntityId,
  TableEntityId,
} from "../types";

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
  entityId: Partial<EntityId>,
): entityId is TableEntityId => entityId.tableId != null;
export const isSchemaEntityId = (
  entityId: Partial<EntityId>,
): entityId is SchemaEntityId =>
  entityId.schemaName != null && !isTableEntityId(entityId);
export const isDatabaseEntityId = (
  entityId: Partial<EntityId>,
): entityId is DatabaseEntityId =>
  entityId.databaseId != null &&
  !isSchemaEntityId(entityId) &&
  !isTableEntityId(entityId);
