import { sdk } from "embedding-sdk/store/reducer";
import { combineReducers } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import * as qb from "metabase/query_builder/reducers";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SdkIframeEmbedRoute } from "./components/SdkIframeEmbedRoute";

if (hasPremiumFeature("embedding_iframe_sdk")) {
  PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled = () => true;

  PLUGIN_EMBEDDING_IFRAME_SDK.SdkIframeEmbedRoute = SdkIframeEmbedRoute;

  // Reducers needed for embedding the SDK in an iframe
  PLUGIN_EMBEDDING_IFRAME_SDK.additionalPublicReducerPlugins = {
    sdk,
    qb: combineReducers(qb),
  };
}
