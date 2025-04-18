// Reducers needed for public questions and dashboards

import { PLUGIN_EMBEDDING_IFRAME_SDK } from "./plugins";
import { commonReducers } from "./reducers-common";

export const publicReducers = {
  ...commonReducers,
  ...PLUGIN_EMBEDDING_IFRAME_SDK.additionalPublicReducerPlugins,
};
