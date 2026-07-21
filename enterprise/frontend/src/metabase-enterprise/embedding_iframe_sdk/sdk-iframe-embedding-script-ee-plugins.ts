import { PLUGIN_EMBED_JS_EE } from "metabase/embedding/embedding-iframe-sdk/script/plugin";

import { EmbedAuthManager } from "./auth-manager/AuthManager";

export const initializePlugins = () => {
  PLUGIN_EMBED_JS_EE.EmbedAuthManager = EmbedAuthManager;
};
