import type { DatabaseId, SchemaId, SchemaName } from "metabase-types/api";

export const getSchemaName = (id: string | null | undefined): SchemaId => {
  return parseSchemaId(id)[1];
};

type ParseSchemaIdResultOptions = {
  isDatasets?: boolean;
};

type ParseSchemaIdResult =
  | [DatabaseId, SchemaId]
  | [DatabaseId, SchemaId, ParseSchemaIdResultOptions];

export const parseSchemaId = (
  id: string | null | undefined,
): ParseSchemaIdResult => {
  const schemaId = String(id || "");
  const [databaseId, schemaName, encodedPayload] = schemaId.split(":");
  const result: ParseSchemaIdResult = [
    parseInt(databaseId, 10),
    decodeURIComponent(schemaName),
  ];
  if (encodedPayload) {
    result.push(JSON.parse(decodeURIComponent(encodedPayload)));
  }
  return result;
};

export const generateSchemaId = (
  dbId: DatabaseId,
  schemaName: SchemaName | undefined | null,
  payload?: unknown,
): string => {
  // Schema ID components are separated with colons
  // Schema name should be encoded to escape colon characters
  // so parseSchemaId can work correctly
  const name = schemaName ? encodeURIComponent(schemaName) : "";
  let id = `${dbId}:${name}`;
  if (payload) {
    const json = JSON.stringify(payload);
    const encodedPayload = encodeURIComponent(json);
    id += `:${encodedPayload}`;
  }
  return id;
};
