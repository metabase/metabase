/* @flow */

// Reducers needed for public questions and dashboards

import commonReducers from "./reducers-common";

import dashboard from "metabase/dashboard/dashboard";

export default {
  ...commonReducers,
  dashboard,
};
