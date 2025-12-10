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
