/* @flow */

// Reducers needed for main application

import { combineReducers } from "redux";

import commonReducers from "./reducers-common";

/* admin */
import admin from "metabase/admin/admin";

/* setup */
import * as setup from "metabase/setup/reducers";

/* user settings */
import * as user from "metabase/user/reducers";

/* dashboards */
import dashboards from "metabase/dashboards/dashboards";
import dashboard from "metabase/dashboard/dashboard";
import * as home from "metabase/home/reducers";

/* questions / query builder */
import new_query from "metabase/new_query/new_query";
import * as qb from "metabase/query_builder/reducers";

/* data reference */
import reference from "metabase/reference/reference";

/* revisions */
import revisions from "metabase/redux/revisions";

/* alerts */
import alert from "metabase/alert/alert";

/* pulses */
import * as pulse from "metabase/pulse/reducers";

/* xrays */
import xray from "metabase/xray/xray";

export default {
  ...commonReducers,

  // main app reducers
  alert,
  dashboards,
  dashboard,
  home: combineReducers(home),
  new_query,
  pulse: combineReducers(pulse),
  qb: combineReducers(qb),
  reference,
  revisions,
  xray,
  setup: combineReducers(setup),
  user: combineReducers(user),
  admin,
};
