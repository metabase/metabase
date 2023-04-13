// Reducers needed for main application

import { combineReducers } from "@reduxjs/toolkit";

import { PLUGIN_REDUCERS } from "metabase/plugins";

/* admin */
import admin from "metabase/admin/admin";

/* setup */
import * as setup from "metabase/setup/reducers";

/* dashboards */
import dashboard from "metabase/dashboard/reducers";

/* parameters */
import * as parameters from "metabase/parameters/reducers";

/* home page */
import * as home from "metabase/home/reducers";

/* query builder */
import * as qb from "metabase/query_builder/reducers";

/* data reference */
import reference from "metabase/reference/reference";

/* revisions */
import revisions from "metabase/redux/revisions";

/* alerts */
import alert from "metabase/alert/alert";

/* pulses */
import * as pulse from "metabase/pulse/reducers";

/* metabot */
import * as metabot from "metabase/metabot/reducers";

import commonReducers from "./reducers-common";

export default {
  ...commonReducers,

  // main app reducers
  alert,
  dashboard,
  parameters: combineReducers(parameters),
  home: combineReducers(home),
  metabot: combineReducers(metabot),
  pulse: combineReducers(pulse),
  qb: combineReducers(qb),
  reference,
  revisions,
  setup: combineReducers(setup),
  admin,
  plugins: combineReducers(PLUGIN_REDUCERS),
};
