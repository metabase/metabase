import { PLUGIN_REDUCERS } from "metabase/plugins";

import { reportsReducer } from "./reports.slice";

// Register the reports reducer with the plugin system
Object.assign(PLUGIN_REDUCERS, {
  reports: reportsReducer,
});
