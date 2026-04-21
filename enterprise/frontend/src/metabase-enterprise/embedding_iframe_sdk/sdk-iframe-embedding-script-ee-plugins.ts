import { PLUGIN_EMBED_JS_EE } from "metabase/embed/iframe-sdk/plugin";

import { EmbedAuthManager } from "./auth-manager/AuthManager";

export const initializePlugins = () => {
  PLUGIN_EMBED_JS_EE.EmbedAuthManager = EmbedAuthManager;
};
