/* @flow */

import { combineEntities } from "metabase/lib/entities";

// $FlowFixMe: doesn't know about require.context
const req = require.context("metabase/entities", true, /.*.js$/);

export const { entities, reducers, reducer } = combineEntities(
  req.keys().map(key => req(key).default),
);
export default reducer;

(window.Metabase = window.Metabase || {}).entities = entities;
