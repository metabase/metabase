/* @flow */

import { combineEntities } from "metabase/lib/entities";
import type { Entity } from "metabase/lib/entities";

import * as entitiesMap from "metabase/entities";
import { compose } from "redux";

// $FlowFixMe
const entitiesArray: Entity[] = Object.values(entitiesMap);

export const { entities, reducer, entitiesRequestsReducer } = combineEntities(
  entitiesArray,
);
export default reducer;

export const enhanceRequestsReducer = originalRequestsReducer => {
  return (state, action) =>
    originalRequestsReducer(entitiesRequestsReducer(state, action), action);
};

(window.Metabase = window.Metabase || {}).entities = entities;
