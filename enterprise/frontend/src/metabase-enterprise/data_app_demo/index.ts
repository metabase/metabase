import { PLUGIN_DATA_APP_DEMO } from "metabase/plugins";

import { DataAppDemo } from "./DataAppDemo";

export function initializePlugin() {
  Object.assign(PLUGIN_DATA_APP_DEMO, {
    DataAppDemo,
  });
}
