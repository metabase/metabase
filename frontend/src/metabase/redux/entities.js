/* @flow */

import { combineEntities } from "metabase/lib/entities";
import type { Entity } from "metabase/lib/entities";

import * as entitiesMap from "metabase/entities";

// $FlowFixMe
const entitiesArray: Entity[] = Object.values(entitiesMap);

export const { entities, reducers, reducer } = combineEntities(entitiesArray);
export default reducer;

(window.Metabase = window.Metabase || {}).entities = entities;
