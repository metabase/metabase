import { createRoot } from "react-dom/client";

import { McpUiAppRoute } from "metabase/embedding/mcp/McpUiAppRoute";

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
