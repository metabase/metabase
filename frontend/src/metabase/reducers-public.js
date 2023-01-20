// Reducers needed for public questions and dashboards
import dashboard from "metabase/dashboard/reducers";
import commonReducers from "./reducers-common";

export default {
  ...commonReducers,
  dashboard,
};
