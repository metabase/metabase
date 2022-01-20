export const getDatabaseEntityId = databaseEntity => ({
  databaseId: databaseEntity.id,
});

export const getSchemaEntityId = schemaEntity => ({
  databaseId: schemaEntity.database.id,
  schemaName: schemaEntity.name,
});

export const getTableEntityId = tableEntity => ({
  databaseId: tableEntity.db_id,
  schemaName: tableEntity.schema_name,
  tableId: tableEntity.id,
});

export const isTableEntityId = entityId => entityId.tableId != null;
export const isSchemaEntityId = entityId =>
  entityId.schemaName != null && !isTableEntityId(entityId);
export const isDatabaseEntityId = entityId =>
  entityId.databaseId != null &&
  !isSchemaEntityId(entityId) &&
  !isTableEntityId(entityId);
