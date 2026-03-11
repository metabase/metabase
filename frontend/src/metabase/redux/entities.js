import * as entitiesMap from "metabase/entities";
import { combineEntities } from "metabase/lib/entities";
import { PLUGIN_ENTITIES } from "metabase/plugins";

const entitiesArray = Object.values({
  ...entitiesMap,
  ...PLUGIN_ENTITIES.entities,
});

export const { entities, reducer, requestsReducer } =
  combineEntities(entitiesArray);
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default reducer;

export const enhanceRequestsReducer = (originalRequestsReducer) => {
  return (state, action) =>
    originalRequestsReducer(requestsReducer(state, action), action);
};

(window.Metabase = window.Metabase || {}).entities = entities;
