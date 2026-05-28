import * as entitiesMap from "metabase/entities";
import { questionsReducer } from "metabase/entities/questions-reducer";
import { tablesReducer } from "metabase/entities/tables-reducer";
import { combineEntities } from "metabase/entities/utils";
import { PLUGIN_ENTITIES } from "metabase/plugins";

// `metabase/entities` no longer exports any entities, so guard against
// non-entity values (e.g. interop artifacts from the empty barrel) reaching
// combineEntities.
const entitiesArray = Object.values({
  ...entitiesMap,
  ...PLUGIN_ENTITIES.entities,
}).filter((entity) => entity?.reducers != null);

export const { entities, reducer, requestsReducer } = combineEntities(
  entitiesArray,
  { questions: questionsReducer, tables: tablesReducer },
);
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default reducer;

export const enhanceRequestsReducer = (originalRequestsReducer) => {
  return (state, action) =>
    originalRequestsReducer(requestsReducer(state, action), action);
};

(window.Metabase = window.Metabase || {}).entities = entities;
