import { type Schema, normalize } from "normalizr";

// this action is handled by entity reducers in `handleEntities` in
// `frontend/src/metabase/lib/redux/utils.js`
export const UPDATE_METADATA_ACTION = "metabase/entities/UPDATE";

export function updateMetadata(data: unknown, schema: Schema) {
  const payload = normalize(data, schema);
  return { type: UPDATE_METADATA_ACTION, payload };
}
