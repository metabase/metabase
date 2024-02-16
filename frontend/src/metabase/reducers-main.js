// Reducers needed for main application

import { combineReducers } from "@reduxjs/toolkit";

import { PLUGIN_REDUCERS } from "metabase/plugins";

import admin from "metabase/admin/admin";

import { reducer as setup } from "metabase/setup/reducers";

import { dashboardReducers as dashboard } from "metabase/dashboard/reducers";

import * as parameters from "metabase/parameters/reducers";

import * as qb from "metabase/query_builder/reducers";

import reference from "metabase/reference/reference";

import revisions from "metabase/redux/revisions";

import alert from "metabase/alert/alert";

import * as pulse from "metabase/pulse/reducers";

import * as metabot from "metabase/metabot/reducers";

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
