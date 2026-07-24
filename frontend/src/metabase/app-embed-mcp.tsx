// Must run before any dynamic import(): sets webpack's runtime publicPath so
// on-demand chunks (leaflet, echarts) resolve to the Metabase instance.
import "./app-embed-mcp-public-path";
import { createRoot } from "react-dom/client";

// Import the embedding SDK vendors side-effects (sets up global CSS vars, etc.)
import "metabase/embedding-sdk/vendors-side-effects";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { McpUiAppRoute } from "metabase/embedding/mcp/McpUiAppRoute";
import { PLUGIN_API } from "metabase/plugins";
import { setBasename } from "metabase/utils/basename";
// Load EE plugins (whitelabeling, etc.) - no-op in OSS
import "sdk-iframe-embedding-ee-plugins";

import { setSessionTokenHeader } from "./embedding/lib/auth/set-session-token-header";

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
EMBEDDING_SDK_CONFIG.isMcpApp = true;
EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader = "mcp-apps";
EMBEDDING_SDK_CONFIG.tokenFeatureKey = "embedding_simple";

// Set session token immediately so all SDK API calls include X-Metabase-Session.
// @ts-expect-error -- this is ONLY set in the MCP Apps route
const { instanceUrl, sessionToken = "" } = window.metabaseConfig ?? {};

setBasename(instanceUrl);

if (sessionToken) {
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddingRequestAuthHeaders =
    setSessionTokenHeader(sessionToken);
}

function init() {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    console.error("no #root element found on mcp embed route");
    return;
  }

  createRoot(rootElement).render(<McpUiAppRoute />);
}

if (document.readyState !== "loading") {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}
