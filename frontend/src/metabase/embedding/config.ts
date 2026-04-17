import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { getIsEmbedPreview } from "metabase/get-is-embed-preview";
import api from "metabase/utils/api";
import { isWithinIframe } from "metabase/utils/iframe";

type InternalEmbeddingConfig = {
  isPublicEmbedding: boolean;
  isStaticEmbedding: boolean;
};

const EMBEDDING_CONFIG: InternalEmbeddingConfig = {
  isPublicEmbedding: false,
  isStaticEmbedding: false,
};

export function setIsPublicEmbedding() {
  api.requestClient = "embedding-public";

  EMBEDDING_CONFIG.isPublicEmbedding = true;
}

export function setIsStaticEmbedding() {
  /**
   * We counted static embed preview query executions which led to wrong embedding stats (EMB-930)
   * This header is only used for analytics and for checking if we want to disable some features in the
   * embedding iframe (only for Documents at the time of this comment)
   */
  if (!getIsEmbedPreview()) {
    api.requestClient = "embedding-iframe-static";
  }
  EMBEDDING_CONFIG.isStaticEmbedding = true;
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
