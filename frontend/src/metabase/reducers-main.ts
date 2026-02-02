// Reducers needed for main application

import { combineReducers } from "@reduxjs/toolkit";

import { admin } from "metabase/admin/admin";
import { reducer as metricsExplorer } from "metabase/metrics-explorer/metrics-explorer.slice";
import * as pulse from "metabase/notifications/pulse/reducers";
import { PLUGIN_REDUCERS } from "metabase/plugins";
import * as qb from "metabase/query_builder/reducers";
import revisions from "metabase/redux/revisions";
import reference from "metabase/reference/reference";
import { reducer as setup } from "metabase/setup/reducers";
import { reducer as visualizer } from "metabase/visualizer/visualizer.slice";

import { commonReducers } from "./reducers-common";

/*
Create a main reducers factory
This solves a race condition in tests, where tests were referencing
the mainReducers const before the EE plugins were required. This way
tests can get a fresh reducers object _after_ the EE plugins are required
while the default behavior is preserved.
*/
export function makeMainReducers() {
  return {
    ...commonReducers,
    // main app reducers
    pulse: combineReducers(pulse),
    qb: combineReducers(qb),
    reference,
    revisions,
    setup,
    admin,
    plugins: combineReducers(PLUGIN_REDUCERS),
    visualizer,
    metricsExplorer,
  };
}

export const mainReducers = makeMainReducers();
