import {
  EMBEDDING_SDK_CONFIG,
  isEmbeddingSdk,
} from "metabase/embedding-sdk/config";
import { PLUGIN_API, PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { IFRAMED_IN_SELF, isWithinIframe } from "metabase/utils/iframe";

import { setEmbedPreviewHeader } from "./lib/auth/set-embed-preview-header";
import { setReactSdkEmbedReferrerHeader } from "./lib/auth/set-react-sdk-embed-referrer-header";
import { setRequestClientHeaders } from "./lib/auth/set-request-client-headers";

type InternalEmbeddingConfig = {
  isPublicEmbedding: boolean;
  isStaticEmbedding: boolean;
};

const EMBEDDING_CONFIG: InternalEmbeddingConfig = {
  isPublicEmbedding: false,
  isStaticEmbedding: false,
};

export function setIsPublicEmbedding() {
  PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders =
    setRequestClientHeaders({ name: "embedding-public" });
  PLUGIN_API.onBeforeRequestHandlers.setEmbedPreviewHeader =
    setEmbedPreviewHeader;

  EMBEDDING_CONFIG.isPublicEmbedding = true;
}

export function setIsStaticEmbedding() {
  /**
   * We counted static embed preview query executions which led to wrong embedding stats (EMB-930)
   * This header is only used for analytics and for checking if we want to disable some features in the
   * embedding iframe (only for Documents at the time of this comment)
   */
  if (!isEmbedPreview()) {
    PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders =
      setRequestClientHeaders({ name: "embedding-iframe-static" });
  }

  EMBEDDING_CONFIG.isStaticEmbedding = true;
}

export function setIsDataApp(
  dataAppName: string,
  { isDev = false }: { isDev?: boolean } = {},
) {
  EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
  EMBEDDING_SDK_CONFIG.isDataApp = true;
  EMBEDDING_SDK_CONFIG.isDataAppDev = isDev;
  EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader = "data-app";
  EMBEDDING_SDK_CONFIG.metabaseClientRequestIdentifier = dataAppName;

  PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders =
    setRequestClientHeaders({
      name: EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      identifier: EMBEDDING_SDK_CONFIG.metabaseClientRequestIdentifier,
    });

  PLUGIN_API.onBeforeRequestHandlers.setEmbedPreviewHeader =
    setEmbedPreviewHeader;

  PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.reactSdkEmbedReferrer =
    setReactSdkEmbedReferrerHeader;
}

export function isPublicEmbedding() {
  return EMBEDDING_CONFIG.isPublicEmbedding;
}

export function isStaticEmbedding() {
  return EMBEDDING_CONFIG.isStaticEmbedding;
}

export function isEmbedding() {
  return isWithinIframe() || isEmbeddingSdk();
}

/**
 * Detect if this page is an embed preview.
 * The check that it is NOT a data app is required, as a data app is rendered inside an iframe inside Metabase
 */
export function isEmbedPreview() {
  return IFRAMED_IN_SELF && !EMBEDDING_SDK_CONFIG.isDataApp;
}

/**
 * Detect if a data app is run in dev env (Vite dev app)
 */
export function isDataAppDev() {
  return EMBEDDING_SDK_CONFIG.isDataAppDev;
}
