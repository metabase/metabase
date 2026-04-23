import type { EmbeddingType } from "metabase/public/lib/types";

export const STATIC_LEGACY_EMBEDDING_TYPE: EmbeddingType = "static-legacy";
export const GUEST_EMBED_EMBEDDING_TYPE: EmbeddingType = "guest-embed";

/**
 * URL query param used to signal that a sub-flow (dashboard editing,
 * database connection, xray picker) was entered from the embedding setup
 * guide and should offer a "return to setup guide" affordance on completion.
 */
export const RETURN_TO_SETUP_GUIDE_PARAM = "returnToEmbeddingSetupGuide";
