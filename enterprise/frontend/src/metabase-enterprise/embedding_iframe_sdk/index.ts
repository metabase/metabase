import { sdk } from "embedding-sdk/store/reducer";
import { combineReducers } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import * as qb from "metabase/query_builder/reducers";
import { isInteractiveEmbeddingEnabled } from "metabase-enterprise/embedding/selectors";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SdkInteractiveEmbedRoute } from "./components/SdkInteractiveEmbedRoute";

if (hasPremiumFeature("embedding_iframe_sdk")) {
  PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled = () => true;

  // TODO: make this a separate setting once we have the new embed flow
  PLUGIN_EMBEDDING_IFRAME_SDK.isInteractiveEmbeddingEnabled =
    isInteractiveEmbeddingEnabled;

  PLUGIN_EMBEDDING_IFRAME_SDK.InteractiveEmbedRoute = SdkInteractiveEmbedRoute;

  // Reducers needed for embedding the SDK in an iframe
  PLUGIN_EMBEDDING_IFRAME_SDK.additionalPublicReducerPlugins = {
    sdk,
    qb: combineReducers(qb),
  };
}
