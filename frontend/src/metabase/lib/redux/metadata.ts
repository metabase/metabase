import { type Schema, normalize } from "normalizr";

const UPDATE = "metabase/entities/UPDATE";

export function updateMetadata(data: unknown, schema: Schema) {
  const payload = normalize(data, schema);
  return { type: UPDATE, payload };
}
