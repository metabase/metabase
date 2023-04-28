// Reducers shared between "main" and "public" apps

/* ducks */
import app from "metabase/redux/app";
import embed from "metabase/redux/embed";
import requests from "metabase/redux/requests";
import settings from "metabase/redux/settings";
import undo from "metabase/redux/undo";
import upload from "metabase/redux/uploads";
// eslint-disable-next-line import/no-named-as-default
import entities, { enhanceRequestsReducer } from "metabase/redux/entities";

/* user */
import { currentUser } from "metabase/redux/user";

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
  upload,
};
