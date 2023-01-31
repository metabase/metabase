// Reducers shared between "main" and "public" apps
import { combineReducers } from "redux";

/* ducks */
import app from "metabase/redux/app";
import embed from "metabase/redux/embed";
import requests from "metabase/redux/requests";
import settings from "metabase/redux/settings";
import undo from "metabase/redux/undo";
// eslint-disable-next-line import/no-named-as-default
import entities, { enhanceRequestsReducer } from "metabase/redux/entities";
import { currentUser } from "metabase/redux/user";
import * as parameters from "metabase/parameters/reducers";

export default {
  // global reducers
  app,
  embed,
  currentUser,
  // "entities" framework needs control over "requests" state
  requests: enhanceRequestsReducer(requests),
  settings,
  undo,
  entities,
  parameters: combineReducers(parameters),
};
