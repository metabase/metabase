// Reducers needed for public questions and dashboards

import { combineReducers } from "redux";
import * as qb from "metabase/query_builder/reducers";
import dashboard from "metabase/dashboard/reducers";
import commonReducers from "./reducers-common";

export default {
  ...commonReducers,
  qb: combineReducers(qb),
  dashboard,
};
