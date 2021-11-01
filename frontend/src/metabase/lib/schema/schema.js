// backend returns model = "card" instead of "question"
export const entityTypeForModel = model =>
  model === "card" || model === "dataset" ? "questions" : `${model}s`;

export const entityTypeForObject = object =>
  object && entityTypeForModel(object.model);

export const getSchemaName = id => parseSchemaId(id)[1];

export const parseSchemaId = id => {
  const schemaId = String(id || "");
  const firstColonIndex = schemaId.indexOf(":");
  const secondColonIndex = schemaId.indexOf(":", firstColonIndex + 1);
  const dbId = schemaId.substring(0, firstColonIndex);
  const schemaName =
    secondColonIndex === -1
      ? schemaId.substring(firstColonIndex + 1)
      : schemaId.substring(firstColonIndex + 1, secondColonIndex);
  const payload =
    secondColonIndex > 0 && schemaId.substring(secondColonIndex + 1);
  const parsed = [dbId, decodeURIComponent(schemaName)];
  if (payload) {
    parsed.push(JSON.parse(payload));
  }
  return parsed;
};

export const generateSchemaId = (dbId, schemaName, payload) => {
  // Schema ID components are separated with colons
  // Schema name should be encoded to escape colon characters
  // so parseSchemaId can work correctly
  const name = schemaName ? encodeURIComponent(schemaName) : "";
  let id = `${dbId}:${name}`;
  if (payload) {
    id += `:${JSON.stringify(payload)}`;
  }
  return id;
};
