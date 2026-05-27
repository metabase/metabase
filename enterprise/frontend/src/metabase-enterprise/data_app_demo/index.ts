import { PLUGIN_DATA_APP_DEMO } from "metabase/plugins";

import { AppView } from "./AppView";
import { DataAppFormPage } from "./DataAppFormPage";
import { ManageDataAppsPage } from "./ManageDataAppsPage";

export function initializePlugin() {
  Object.assign(PLUGIN_DATA_APP_DEMO, {
    AppView,
    ManageDataAppsPage,
    DataAppFormPage,
  });
}
