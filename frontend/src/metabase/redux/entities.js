import * as entitiesMap from "metabase/entities";
import { combineEntities } from "metabase/lib/entities";

const entitiesArray = Object.values(entitiesMap);

export const { entities, reducer, requestsReducer } =
  combineEntities(entitiesArray);
export default reducer;

export const enhanceRequestsReducer = originalRequestsReducer => {
  return (state, action) =>
    originalRequestsReducer(requestsReducer(state, action), action);
};

(window.Omniloy = window.Omniloy || {}).entities = entities;
