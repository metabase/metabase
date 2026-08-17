import { updateIn } from "icepick";

import { CARD_CREATED, CARD_UPDATED } from "metabase/redux/cards";
import {
  convertSavedQuestionToVirtualTable,
  getCollectionVirtualSchemaId,
  getCollectionVirtualSchemaName,
  getQuestionVirtualTableId,
} from "metabase-lib/v1/metadata/utils/saved-questions";

type TableState = Record<string, any>;
type ReducerAction = { type: string; payload?: any; error?: unknown };

/**
 * Reducer for the `state.entities.tables` slice.
 *
 * Tables no longer go through the entity framework — CRUD lives in
 * `metabase/api/table`. The slice itself is still consumed by `getMetadata` in
 * `metabase/selectors/metadata.ts`, so we keep it in sync when:
 *
 * - questions are created/updated/archived (the saved-question virtual table
 *   `card__<id>` representation needs to track them), and
 * - a field is updated elsewhere (so `original_fields` doesn't go stale).
 *
 * It runs after the generic slice reducer in `./index` has merged any
 * `payload.entities.tables` from `metabase/entities/*` actions.
 */
export function tablesReducer(
  state: TableState = {},
  { type, payload, error }: ReducerAction,
): TableState {
  if (type === CARD_CREATED && !error) {
    const card = payload.question;
    const virtualQuestionTable = convertSavedQuestionToVirtualTable(card);

    if (state[virtualQuestionTable.id]) {
      return state;
    }

    return {
      ...state,
      [virtualQuestionTable.id]: virtualQuestionTable,
    };
  }

  if (type === CARD_UPDATED && !error) {
    const card = payload.question;
    const virtualTableId = getQuestionVirtualTableId(card.id);

    if (card.archived && state[virtualTableId]) {
      const nextState = { ...state };
      delete nextState[virtualTableId];
      return nextState;
    }

    if (state[virtualTableId]) {
      const virtualTable = state[virtualTableId];
      const virtualSchemaId = getCollectionVirtualSchemaId(card.collection);
      const virtualSchemaName = getCollectionVirtualSchemaName(card.collection);

      if (
        virtualTable.display_name !== card.name ||
        virtualTable.moderated_status !== card.moderated_status ||
        virtualTable.description !== card.description ||
        virtualTable.schema !== virtualSchemaId ||
        virtualTable.schema_name !== virtualSchemaName
      ) {
        state = updateIn(state, [virtualTableId], (table) => ({
          ...table,
          display_name: card.name,
          moderated_status: card.moderated_status,
          description: card.description,
          schema: virtualSchemaId,
          schema_name: virtualSchemaName,
        }));
      }

      return state;
    }

    return {
      ...state,
      [virtualTableId]: convertSavedQuestionToVirtualTable(card),
    };
  }

  // Keep `original_fields` in sync when something dispatches
  // `updateMetadata(field, FieldSchema)` (e.g. RTK Query's getField
  // onQueryStarted). Without this, edits land in state.entities.fields but
  // hydrateTableFields keeps reading stale data from original_fields.
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
