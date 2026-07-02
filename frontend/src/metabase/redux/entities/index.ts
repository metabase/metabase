import { type Reducer, combineReducers } from "@reduxjs/toolkit";
import { getIn } from "icepick";

import { tablesReducer } from "./tables-reducer";

type SliceState = Record<string, unknown>;
type SliceAction = { type: string; payload?: any };
type SliceReducer = Reducer<SliceState>;

/**
 * Slices held under `state.entities.<name>`. These used to be wired up by the
 * (now-removed) entity framework via `createEntity`; the slices themselves
 * still exist because `getMetadata` in `metabase/selectors/metadata.ts` reads
 * directly from them. RTK Query endpoints populate the slices by dispatching
 * `metabase/entities/UPDATE` (see `hydrateMetadataStore`).
 */
const ENTITY_SLICE_NAMES = [
  "collections",
  "dashboards",
  "databases",
  "fields",
  "measures",
  "metrics",
  "questions",
  "schemas",
  "segments",
  "snippets",
  "tables",
] as const;

const ACTION_PATTERN = /^metabase\/entities\//;

/**
 * Merges newEntities into entities, deleting keys whose value is nullish.
 * Existing entries are shallow-merged so partial entities don't overwrite
 * full ones.
 */
function mergeEntities(
  entities: SliceState,
  newEntities: Record<string, unknown>,
): SliceState {
  const result = { ...entities };
  for (const id of Object.keys(newEntities)) {
    const entry = newEntities[id];
    if (entry == null) {
      delete result[id];
    } else {
      result[id] = {
        ...((result[id] as Record<string, unknown>) ?? {}),
        ...(entry as Record<string, unknown>),
      };
    }
  }
  return result;
}

/**
 * Build the reducer for a single `state.entities.<name>` slice. It merges any
 * `payload.entities.<name>` from `metabase/entities/*` actions and then runs
 * the optional custom reducer on top.
 */
function makeSliceReducer(
  sliceName: string,
  customReducer?: SliceReducer,
): SliceReducer {
  return (state = {}, action: SliceAction) => {
    let nextState = state;
    const entities = getIn(action, ["payload", "entities", sliceName]) as
      | Record<string, unknown>
      | undefined;
    if (ACTION_PATTERN.test(action.type) && entities) {
      nextState = mergeEntities(nextState, entities);
    }
    return customReducer ? customReducer(nextState, action) : nextState;
  };
}

const customReducers: Partial<Record<string, SliceReducer>> = {
  tables: tablesReducer as SliceReducer,
};

const sliceReducers = Object.fromEntries(
  ENTITY_SLICE_NAMES.map((name) => [
    name,
    makeSliceReducer(name, customReducers[name]),
  ]),
) as Record<(typeof ENTITY_SLICE_NAMES)[number], SliceReducer>;

export const reducer = combineReducers(sliceReducers);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default reducer;
