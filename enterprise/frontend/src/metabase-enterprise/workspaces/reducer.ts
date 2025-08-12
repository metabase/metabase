import { PLUGIN_REDUCERS } from "metabase/plugins";

import { workspacesReducer } from "./workspaces.slice";

// Register the workspaces reducer with the plugin system
Object.assign(PLUGIN_REDUCERS, {
  workspaces: workspacesReducer,
});