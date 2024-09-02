import { PLUGIN_REDUCERS } from "metabase/plugins";

import { shared } from "./reducer";

export const activateSharedPlugin = () => {
  PLUGIN_REDUCERS.shared = shared.reducer;
};
