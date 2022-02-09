// Reducers needed for public questions and dashboards

import commonReducers from "./reducers-common";

import dashboard from "metabase/dashboard/reducers";

export default {
  ...commonReducers,
  dashboard,
};
