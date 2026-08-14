import { type Reducer, combineReducers } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import _ from "underscore";

import { tablesReducer } from "./tables-reducer";

type Entity = Record<string, unknown>;
type SliceState = Record<string, Entity>;
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
 *
 * The merge is gated on content. An entity keeps its previous reference when
 * the merged result is deeply equal to it, and the slice keeps its own
 * reference when no entity changed. `getMetadata` rebuilds the whole
 * metabase-lib graph when a slice reference changes, and the graph identity is
 * the cache key for the MLv2 metadata provider. Without the gate, a refetch
 * that returns identical data still throws that cache away.
 */
function mergeEntities(
  entities: SliceState,
  newEntities: Record<string, Entity | null>,
): SliceState {
  let result: SliceState | undefined;
  const writable = () => (result ??= { ...entities });

  for (const id of Object.keys(newEntities)) {
    const entry = newEntities[id];

    if (entry == null) {
      if (id in entities) {
        delete writable()[id];
      }
      continue;
    }

    const previous = entities[id];
    const merged = { ...(previous ?? {}), ...entry };

    if (!_.isEqual(previous, merged)) {
      writable()[id] = merged;
    }
  }

  return result ?? entities;
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
    // `action.payload` is the untyped output of normalizr, so the shape of the
    // slice it carries is only known by convention.
    const entities = getIn(action, ["payload", "entities", sliceName]) as
      | Record<string, Entity | null>
      | undefined;
    if (ACTION_PATTERN.test(action.type) && entities) {
      nextState = mergeEntities(nextState, entities);
    }
    if (customReducer) {
      // `mergeEntities` gates each entity, but a custom reducer can still
      // write an entity back to the content it already had. The tables
      // reducer does exactly that: `mergeEntities` takes the plain table from
      // the payload, then the reducer re-adds the `original_fields` the
      // previous table already carried. Compare once more so an unchanged
      // slice keeps its reference.
      const customState = customReducer(nextState, action);
      nextState = _.isEqual(customState, state) ? state : customState;
    }
    return nextState;
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

export const reducer = combineReducers(sliceReducers);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default reducer;
