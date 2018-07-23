// NOTE: these are "public" settings
export const getIsPublicSharingEnabled = state =>
  state.settings.values["public_sharing"];
export const getIsApplicationEmbeddingEnabled = state =>
  state.settings.values["embedding"];

// NOTE: these are admin-only settings
export const getSiteUrl = state => state.settings.values["site-url"];
export const getEmbeddingSecretKey = state =>
  state.settings.values["embedding-secret-key"];

export const getLogoUrl = state =>
  state.settings.values["application-logo-url"] ||
  state.settings.values.application_logo_url ||
  "app/assets/img/logo.svg";
