// Reducers shared between "main" and "public" apps

import { combineReducers } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { dashboardReducers as dashboard } from "metabase/dashboard/reducers";
import * as parameters from "metabase/parameters/reducers";
import app from "metabase/redux/app";
import { reducer as auth } from "metabase/redux/auth";
import { reducer as downloads } from "metabase/redux/downloads";
import embed from "metabase/redux/embed";
import entities, { enhanceRequestsReducer } from "metabase/redux/entities";
import requests from "metabase/redux/requests";
import { settings } from "metabase/redux/settings";
import { modal } from "metabase/redux/ui";
import undo from "metabase/redux/undo";
import upload from "metabase/redux/uploads";
import { currentUser } from "metabase/redux/user";

export const commonReducers = {
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
  auth,
  [Api.reducerPath]: Api.reducer,
  modal,
  dashboard,
  parameters: combineReducers(parameters),
  downloads,
};
