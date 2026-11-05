import { type Reducer, combineReducers } from "@reduxjs/toolkit";
import { getIn } from "icepick";

import { tablesReducer } from "./tables-reducer";

/** One normalized record. Its keys are whatever the endpoint returned. */
type Entity = Record<string, unknown>;
type SliceState = Record<string, Entity>;
type SliceAction = { type: string; payload?: any };
type SliceReducer = Reducer<SliceState>;

/**
 * Slices held under `state.entities.<name>`. `getMetadata` reads them directly.
 *
 * `metadataHydrationMiddleware` in `./hydration` is the only writer, and fills
 * them by dispatching `metabase/entities/UPDATE`.
 */
const ENTITY_SLICE_NAMES = [
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

function hasSameValues(before: Entity, after: Entity): boolean {
  const keys = Object.keys(after);
  return (
    keys.length === Object.keys(before).length &&
    keys.every((key) => before[key] === after[key])
  );
}

/**
 * Merges newEntities into entities, deleting keys whose value is nullish.
 * Existing entries are shallow-merged so partial entities don't overwrite
 * full ones.
 *
 * Returns the same slice, and the same entries within it, when the merge
 * changes nothing. Endpoints re-normalize the same records often, and a fresh
 * object each time would rebuild `getMetadata` and every metabase-lib metadata
 * provider derived from it.
 */
function mergeEntities(
  entities: SliceState,
  newEntities: Record<string, Entity | null>,
): SliceState {
  let result = entities;

  const copyOnce = () => {
    if (result === entities) {
      result = { ...entities };
    }
    return result;
  };

  for (const id of Object.keys(newEntities)) {
    const entry = newEntities[id];

    if (entry == null) {
      if (id in result) {
        delete copyOnce()[id];
      }
      continue;
    }

    const existing: Entity | undefined = result[id];
    const merged = { ...existing, ...entry };
    if (existing != null && hasSameValues(existing, merged)) {
      continue;
    }
    copyOnce()[id] = merged;
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
    // `getIn` walks an untyped action payload, so it can only return
    // `unknown`. The shape is the normalizr output for this slice.
    const entities = getIn(action, ["payload", "entities", sliceName]) as
      | Record<string, Entity | null>
      | undefined;
    if (ACTION_PATTERN.test(action.type) && entities) {
      nextState = mergeEntities(nextState, entities);
    }
    return customReducer ? customReducer(nextState, action) : nextState;
  };
}

const customReducers: Partial<Record<string, SliceReducer>> = {
  tables: tablesReducer,
};

// Unjustified type cast. FIXME
const sliceReducers = Object.fromEntries(
  ENTITY_SLICE_NAMES.map((name) => [
    name,
    makeSliceReducer(name, customReducers[name]),
  ]),
) as Record<(typeof ENTITY_SLICE_NAMES)[number], SliceReducer>;

export const entitiesReducer = combineReducers(sliceReducers);
