import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { IFRAMED_IN_SELF, isWithinIframe } from "metabase/utils/iframe";

type InternalEmbeddingConfig = {
  isPublicEmbedding: boolean;
  isStaticEmbedding: boolean;
};

const EMBEDDING_CONFIG: InternalEmbeddingConfig = {
  isPublicEmbedding: false,
  isStaticEmbedding: false,
};

export function setIsPublicEmbedding() {
  EMBEDDING_CONFIG.isPublicEmbedding = true;
}

export function setIsStaticEmbedding() {
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

/**
 * Detect if this page is embedded in itself, i.e. it's an embed preview.
 * It will need to do something different if we ever embed Metabase in itself for another reason.
 */
export function isEmbedPreview() {
  return IFRAMED_IN_SELF;
}
