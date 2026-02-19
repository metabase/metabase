import type { DatabaseId, SchemaId, SchemaName } from "metabase-types/api";

export const getSchemaName = (id: string | null | undefined): SchemaId => {
  return parseSchemaId(id)[1];
};

type ParseSchemaIdResult = [DatabaseId, SchemaId];

export const parseSchemaId = (
  id: string | null | undefined,
): ParseSchemaIdResult => {
  const schemaId = String(id || "");
  const separatorIndex = schemaId.indexOf(":");
  const databaseId = schemaId.substring(0, separatorIndex);
  const schemaName = schemaId.substring(separatorIndex + 1);
  return [parseInt(databaseId, 10), decodeURIComponent(schemaName)];
};

export const generateSchemaId = (
  dbId: DatabaseId,
  schemaName: SchemaName | undefined | null,
): string => {
  // Schema ID components are separated with colons
  // Schema name should be encoded to escape colon characters
  // so parseSchemaId can work correctly
  const name = schemaName ? encodeURIComponent(schemaName) : "";
  return `${dbId}:${name}`;
};
