/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- FIXME: any-typed values */
type TableState = Record<string, any>;
type ReducerAction = { type: string; payload?: any; error?: unknown };

/**
 * Reducer for the `state.entities.tables` slice.
 *
 * `getMetadata` reads this slice, so it is kept in sync when a field is
 * updated elsewhere (so `original_fields` doesn't go stale).
 *
 * It runs after the generic slice reducer in `./reducer` has merged any
 * `payload.entities.tables` from `metabase/entities/*` actions.
 */
export function tablesReducer(
  state: TableState = {},
  { type, payload, error }: ReducerAction,
): TableState {
  // Keep `original_fields` in sync when a field reaches the mirror, which the
  // hydration listener does for every endpoint carrying one. Without this,
  // edits land in state.entities.fields but hydrateTableFields keeps reading
  // stale data from original_fields.
  //
  // Virtual card tables can have multiple `original_fields` entries with the
  // same `id` (a model with two columns both mapped to the same source
  // field). Normalization collapses those into one entry in
  // `payload.entities.fields`, so we can't tell which `original_fields` entry
  // the update belongs to — skip the sync for ambiguous matches.
  if (
    type === "metabase/entities/UPDATE" &&
    !error &&
    payload?.entities?.fields
  ) {
    let nextState = state;
    for (const updated of Object.values<any>(payload.entities.fields)) {
      // A null entry is a delete, so there is nothing to sync into
      // `original_fields`.
      if (updated == null) {
        continue;
      }
      const tableId = updated.table_id;
      const table = nextState[tableId];
      if (!table?.original_fields) {
        continue;
      }
      const matchingIndex = findUniqueIndex(
        table.original_fields,
        (field: any) => field.id === updated.id,
      );
      if (matchingIndex < 0) {
        continue;
      }
      const nextOriginalFields = [...table.original_fields];
      nextOriginalFields[matchingIndex] = {
        ...nextOriginalFields[matchingIndex],
        ...updated,
      };
      nextState = {
        ...nextState,
        [tableId]: { ...table, original_fields: nextOriginalFields },
      };
    }
    return nextState;
  }

  return state;
}

// Returns the index of the only element matching the predicate, or -1 if there
// are zero or more than one matches.
function findUniqueIndex<T>(
  array: T[],
  predicate: (value: T) => boolean,
): number {
  let found = -1;
  for (let index = 0; index < array.length; index++) {
    if (!predicate(array[index])) {
      continue;
    }
    if (found !== -1) {
      return -1;
    }
    found = index;
  }
  return found;
}
