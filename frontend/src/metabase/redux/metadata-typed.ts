import { type Schema, normalize } from "normalizr";

// Handled by the per-slice reducers in `metabase/redux/entities` — see
// `makeSliceReducer` there, which merges `payload.entities.<name>` into the
// matching `state.entities.<name>` slice so `getMetadata` picks up the change.
const UPDATE = "metabase/entities/UPDATE";

export function updateMetadata(data: unknown, schema: Schema) {
  const payload = normalize(data, schema);
  return { type: UPDATE, payload };
}
