// Reducers needed for public questions and dashboards
import { combineReducers } from "redux";
import dashboard from "metabase/dashboard/reducers";
import * as parameters from "metabase/parameters/reducers";
import commonReducers from "./reducers-common";

export default {
  ...commonReducers,
  dashboard,
  parameters: combineReducers(parameters),
};
