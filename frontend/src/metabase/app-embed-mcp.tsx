import { createRoot } from "react-dom/client";

// Import the embedding SDK vendors side-effects (sets up global CSS vars, etc.)
import "metabase/embedding-sdk/vendors-side-effects";

import api from "metabase/api/legacy-client";
import { McpUiAppRoute } from "metabase/embedding/mcp/McpUiAppRoute";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// Load EE plugins (whitelabeling, etc.) - no-op in OSS
import "sdk-iframe-embedding-ee-plugins";

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
EMBEDDING_SDK_CONFIG.isMcpApp = true;
EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader = "mcp-apps";
EMBEDDING_SDK_CONFIG.tokenFeatureKey = "embedding_simple";

// Set the MCP UI credential immediately so all SDK API calls carry the purpose-bound header.
// @ts-expect-error -- this is ONLY set in the MCP Apps route
const { instanceUrl = "", uiCredential = "" } = window.metabaseConfig ?? {};

if (instanceUrl) {
  api.basename = instanceUrl;
}

if (uiCredential) {
  api.mcpUiCredential = uiCredential;
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
