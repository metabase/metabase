/* @flow */

import { combineEntities } from "metabase/lib/entities";
import type { Entity, Reducer } from "metabase/lib/entities";

import * as entitiesMap from "metabase/entities";

// $FlowFixMe
const entitiesArray: Entity[] = Object.values(entitiesMap);

export const { entities, reducer, requestsReducer } = combineEntities(
  entitiesArray,
);
export default reducer;

export const enhanceRequestsReducer = (
  originalRequestsReducer: Reducer,
): Reducer => {
  return (state, action) =>
    originalRequestsReducer(requestsReducer(state, action), action);
};

(window.Metabase = window.Metabase || {}).entities = entities;
