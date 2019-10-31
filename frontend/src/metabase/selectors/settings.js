// NOTE: these are "public" settings
export const getIsPublicSharingEnabled = state =>
  state.settings.values["enable-public-sharing"];
export const getIsApplicationEmbeddingEnabled = state =>
  state.settings.values["enable-embedding"];
// Whether or not xrays are enabled on the instance
export const getXraysEnabled = state => state.settings.values["enable-xrays"];

// NOTE: these are admin-only settings
export const getSiteUrl = state => state.settings.values["site-url"];
export const getEmbeddingSecretKey = state =>
  state.settings.values["embedding-secret-key"];
