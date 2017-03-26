
// NOTE: these are "public" settings
export const getIsPublicSharingEnabled = (state) => state.settings.values["public_sharing"];
export const getIsApplicationEmbeddingEnabled = (state) => state.settings.values["embedding"];

// NOTE: these are admin-only settings
export const getSiteUrl = (state) => state.settings.values["site-url"];
export const getEmbeddingSecretKey = (state) => state.settings.values["embedding-secret-key"];
