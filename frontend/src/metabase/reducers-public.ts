// Reducers needed for public questions and dashboards
import { sdk } from "embedding-sdk/store/reducer"; // eslint-disable-line no-restricted-imports
import * as qb from "metabase/query_builder/reducers";

import { combineReducers } from "./lib/redux";
import { commonReducers } from "./reducers-common";

export const publicReducers = {
  ...commonReducers,
  sdk,
  qb: combineReducers(qb),
};
