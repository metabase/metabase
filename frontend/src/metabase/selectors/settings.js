import { createSelector } from "reselect";

export const getSettings = state => state.settings.values;

export const getSetting = (state, key) => getSettings(state)[key];

// NOTE: these are "public" settings
export const getIsPublicSharingEnabled = state =>
  state.settings.values["enable-public-sharing"];
export const getIsApplicationEmbeddingEnabled = state =>
  state.settings.values["enable-embedding"];

// Whether or not xrays are enabled on the instance
export const getXraysEnabled = state => state.settings.values["enable-xrays"];

export const getShowHomepageData = state =>
  state.settings.values["show-homepage-data"];

export const getShowHomepageXrays = createSelector(
  [getXraysEnabled, state => state.settings.values["show-homepage-xrays"]],
  (enabled, show) => enabled && show,
);

export const getNestedQueriesEnabled = state =>
  state.settings.values["enable-nested-queries"];

// NOTE: these are admin-only settings
export const getSiteUrl = state => state.settings.values["site-url"];
export const getEmbeddingSecretKey = state =>
  state.settings.values["embedding-secret-key"];
