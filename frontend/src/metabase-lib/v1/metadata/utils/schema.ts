import { SchemaId } from "metabase-types/api";

export const getSchemaName = (id: SchemaId) => {
  return parseSchemaId(id)[1];
};

export const parseSchemaId = (id: SchemaId) => {
  const schemaId = String(id || "");
  const [databaseId, schemaName, encodedPayload] = schemaId.split(":");
  const result = [databaseId, decodeURIComponent(schemaName)];
  if (encodedPayload) {
    result.push(JSON.parse(decodeURIComponent(encodedPayload)));
  }
  return result;
};

export const generateSchemaId = (
  dbId: string | number,
  schemaName: string | number | undefined,
  payload?: Record<string, string | number | boolean>,
) => {
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
