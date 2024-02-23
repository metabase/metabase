// Reducers needed for main application

import { combineReducers } from "@reduxjs/toolkit";

import admin from "metabase/admin/admin";
import alert from "metabase/alert/alert";
import { dashboardReducers as dashboard } from "metabase/dashboard/reducers";
import * as metabot from "metabase/metabot/reducers";
import * as parameters from "metabase/parameters/reducers";
import { PLUGIN_REDUCERS } from "metabase/plugins";
import * as pulse from "metabase/pulse/reducers";
import * as qb from "metabase/query_builder/reducers";
import revisions from "metabase/redux/revisions";
import reference from "metabase/reference/reference";
import { reducer as setup } from "metabase/setup/reducers";

import commonReducers from "./reducers-common";

export default {
  ...commonReducers,

  // main app reducers
  alert,
  dashboard,
  parameters: combineReducers(parameters),
  metabot: combineReducers(metabot),
  pulse: combineReducers(pulse),
  qb: combineReducers(qb),
  reference,
  revisions,
  setup,
  admin,
  plugins: combineReducers(PLUGIN_REDUCERS),
};
