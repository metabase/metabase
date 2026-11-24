import { createRoot } from "react-dom/client";

import { PLUGIN_API } from "metabase/api/client";
import {
  EMBEDDING_SDK_CONFIG,
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG,
} from "metabase/embedding-sdk/config";
import { applyDocumentLocales } from "metabase/utils/boot-locale";

import { PermissionPreviewFrame } from "./PermissionPreviewFrame";
import { addPreviewTokenHeader } from "./preview-requests";

export function startFrame() {
  EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
  EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader = "embedding-sdk-react";
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.useExistingUserSession = true;
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddingRequestAuthHeaders =
    addPreviewTokenHeader;

  renderFrame();
}

async function renderFrame() {
  await applyDocumentLocales();

  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error("no #root element found on the permission preview frame");
  }

  createRoot(rootElement).render(<PermissionPreviewFrame />);
}
