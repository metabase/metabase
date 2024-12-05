// Reducers needed for main application

import { combineReducers } from "@reduxjs/toolkit";

import admin from "metabase/admin/admin";
import * as pulse from "metabase/notifications/pulse/reducers";
import alert from "metabase/notifications/redux/alert";
import { PLUGIN_REDUCERS } from "metabase/plugins";
import * as qb from "metabase/query_builder/reducers";
import revisions from "metabase/redux/revisions";
import reference from "metabase/reference/reference";
import { reducer as setup } from "metabase/setup/reducers";

import { commonReducers } from "./reducers-common";

export const mainReducers = {
  ...commonReducers,

  // main app reducers
  alert,
  pulse: combineReducers(pulse),
  qb: combineReducers(qb),
  reference,
  revisions,
  setup,
  admin,
  plugins: combineReducers(PLUGIN_REDUCERS),
};
