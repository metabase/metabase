import { PLUGIN_EMBED_JS_EE } from "metabase/embedding/embedding-iframe-sdk/plugin";

import { EmbedAuthManager } from "./auth-manager/AuthManager";
import { bridgeHandleLinkForEmbedJs } from "./bridge-handle-link/bridge-handle-link";

export const initializePlugins = () => {
  PLUGIN_EMBED_JS_EE.EmbedAuthManager = EmbedAuthManager;
  PLUGIN_EMBED_JS_EE.bridgeHandleLinkForEmbedJs = bridgeHandleLinkForEmbedJs;
};
