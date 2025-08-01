import { PLUGIN_REDUCERS } from "metabase/plugins";

import { documentsReducer } from "./documents.slice";

// Register the documents reducer with the plugin system
Object.assign(PLUGIN_REDUCERS, {
  documents: documentsReducer,
});
