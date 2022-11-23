import { createSelector } from "reselect";

import type { Settings, SettingKey } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getSettings = createSelector(
  (state: State) => state.settings,
  settings => settings.values,
);

export const getSetting = <T extends SettingKey>(
  state: State,
  key: T,
): Settings[T] => getSettings(state)[key];

const createSettingSelector = (key: SettingKey) => (state: State) =>
  getSetting(state, key);

// Common

export const getXraysEnabled = createSettingSelector("enable-xrays");

export const getShowHomepageData = createSettingSelector("show-homepage-data");

export const getShowHomepageXrays = createSelector(
  getXraysEnabled,
  getShowHomepageData,
  (enabled, show) => enabled && show,
);

export const getNestedQueriesEnabled = createSettingSelector(
  "enable-nested-queries",
);

// Admin settings
export const getSiteUrl = createSettingSelector("site-url");

export const getEmbeddingSecretKey = createSettingSelector(
  "embedding-secret-key",
);

// Public settings
export const getIsPublicSharingEnabled = createSettingSelector(
  "enable-public-sharing",
);

export const getIsApplicationEmbeddingEnabled =
  createSettingSelector("enable-embedding");
