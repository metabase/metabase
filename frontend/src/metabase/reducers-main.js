// Reducers needed for main application

import { combineReducers } from "redux";

import commonReducers from "./reducers-common";

/* admin */
import admin from "metabase/admin/admin";

/* setup */
import * as setup from "metabase/setup/reducers";

/* dashboards */
import dashboard from "metabase/dashboard/reducers";
import * as home from "metabase/home/reducers";

/* query builder */
import * as qb from "metabase/query_builder/reducers";

/* data reference */
import reference from "metabase/reference/reference";

/* revisions */
import revisions from "metabase/redux/revisions";

/* timelines */
import timelines from "metabase/timelines/reducers";

/* alerts */
import alert from "metabase/alert/alert";

/* pulses */
import * as pulse from "metabase/pulse/reducers";

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
  timelines: combineReducers(timelines),
  admin,
};
