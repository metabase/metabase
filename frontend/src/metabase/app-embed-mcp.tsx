import { createRoot } from "react-dom/client";

// Import the embedding SDK vendors side-effects (sets up global CSS vars, etc.)
import "metabase/embedding-sdk/vendors-side-effects";

// eslint-disable-next-line import/order
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
EMBEDDING_SDK_CONFIG.isMcpApp = true;

// TODO(EMB-1534): change this header to "embedding-mcp" as we need to
//                 exclude this from actual embedded analytics
EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader = "embedding-simple";
EMBEDDING_SDK_CONFIG.tokenFeatureKey = "embedding_simple";

// Load EE plugins (whitelabeling, etc.) - no-op in OSS
import "sdk-iframe-embedding-ee-plugins";

// Must be imported after EE plugins and config are set up.
// eslint-disable-next-line import/order
import { McpUiAppRoute } from "metabase/embedding/mcp/McpUiAppRoute";
import api from "metabase/lib/api";

// Set session token immediately so all SDK API calls include X-Metabase-Session.
// @ts-expect-error -- this is ONLY set in the MCP Apps route
const { instanceUrl = "", sessionToken = "" } = window.metabaseConfig ?? {};

if (instanceUrl) {
  api.basename = instanceUrl;
}

if (sessionToken) {
  api.sessionToken = sessionToken;
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
