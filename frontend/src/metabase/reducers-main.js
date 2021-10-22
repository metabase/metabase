// Reducers needed for main application

import { combineReducers } from "redux";

import admin from "metabase/admin/admin";
import * as setup from "metabase/setup/reducers";
import dashboard from "metabase/dashboard/reducers";
import * as home from "metabase/home/reducers";
import * as qb from "metabase/query_builder/reducers";
import reference from "metabase/reference/reference";
import revisions from "metabase/redux/revisions";
import alert from "metabase/alert/alert";
import * as pulse from "metabase/pulse/reducers";

import commonReducers from "./reducers-common";

export default {
  ...commonReducers,

  // main app reducers
  alert,
  dashboard,
  home: combineReducers(home),
  pulse: combineReducers(pulse),
  qb: combineReducers(qb),
  reference,
  revisions,
  setup: combineReducers(setup),
  admin,
};
