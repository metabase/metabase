import { type Schema, normalize } from "normalizr";

import type { State } from "metabase/redux/store";
import type { FieldId, FieldValue } from "metabase-types/api";

const UPDATE = "metabase/entities/UPDATE";

// Normalizes an entity (or list) and dispatches it into `state.entities`.
// Handled by the per-slice reducers in `metabase/redux/entities` — see
// `makeSliceReducer` there, which merges `payload.entities.<name>` into the
// matching `state.entities.<name>` slice so `getMetadata` picks up the change.
export function updateMetadata(data: unknown, schema: Schema) {
  const payload = normalize(data, schema);
  return { type: UPDATE, payload };
}

/**
 * A field's client-accumulated remappings. No endpoint returns these: they are
 * merged in by `addRemappings` as values are fetched, and one component's fetch
 * labels values for another, so a component cannot answer this from its own
 * result.
 */
export function getFieldRemappings(
  state: State,
  fieldId: FieldId,
): FieldValue[] {
  return state.entities.fields[fieldId]?.remappings ?? [];
}
