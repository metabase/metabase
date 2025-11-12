type InternalEmbeddingConfig = {
  isPublicEmbed: boolean;
  isStaticEmbedding: boolean;
};

const EMBEDDING_CONFIG: InternalEmbeddingConfig = {
  isPublicEmbed: false,
  isStaticEmbedding: false,
};

export function setIsPublicEmbed() {
  EMBEDDING_CONFIG.isPublicEmbed = true;
}

export function setIsStaticEmbedding() {
  EMBEDDING_CONFIG.isStaticEmbedding = true;
}

export function isPublicEmbed() {
  return EMBEDDING_CONFIG.isPublicEmbed;
}

export function isStaticEmbedding() {
  return EMBEDDING_CONFIG.isStaticEmbedding;
}
