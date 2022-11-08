export const getSchemaName = id => {
  return parseSchemaId(id)[1];
};

export const parseSchemaId = id => {
  const schemaId = String(id || "");
  const [databaseId, schemaName, encodedPayload] = schemaId.split(":");
  const result = [databaseId, decodeURIComponent(schemaName)];
  if (encodedPayload) {
    result.push(JSON.parse(decodeURIComponent(encodedPayload)));
  }
  return result;
};

export const generateSchemaId = (dbId, schemaName, payload) => {
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
