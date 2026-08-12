import type { State } from "metabase/redux/store";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
  TokenFeature,
} from "metabase-types/api";

import { settingsApi } from "./api";

// Settings (a.k.a. session properties) live in the `getSessionProperties` RTK
// Query cache; `getSettings` reads them from there, falling back to
// `window.MetabaseBootstrap` so reads aren't empty before the first fetch.
//
// The explicit annotation collapses the RTK-generated selector generics; left
// inferred, they leak into every consumer and can push deeply-nested reducer
// files over TypeScript's instantiation-depth limit (TS2589).
const selectSessionProperties: (state: State) => {
  data?: EnterpriseSettings;
  isLoading: boolean;
} = settingsApi.endpoints.getSessionProperties.select();

// Fallback for when neither the cache nor the bootstrap has data: the main app
// always has the server-injected bootstrap, but the embedding SDK runs on a host
// page with no bootstrap and reads settings before auth injects them into the cache.
//
// Hoisted so `getSettings` returns a stable reference
const EMPTY_SETTINGS = {};

// Typed as `EnterpriseSettings` (a superset of the OSS `Settings`): the cache
// holds whatever the backend returned, and reads of OSS keys narrow naturally.
// There is no `settings` key on `State` — settings are not redux state.
export const getSettings = (state: State): EnterpriseSettings =>
  // Unjustified type cast. FIXME
  (selectSessionProperties(state).data ??
    (typeof window !== "undefined" ? window.MetabaseBootstrap : undefined) ??
    EMPTY_SETTINGS) as EnterpriseSettings;

export const getSettingsLoading = (state: State): boolean =>
  selectSessionProperties(state).isLoading;

export const getSetting = <T extends EnterpriseSettingKey>(
  state: State,
  key: T,
): EnterpriseSettings[T] => {
  const settings = getSettings(state);
  const setting = settings[key];
  return setting;
};

export const getTokenFeature = (state: State, feature: TokenFeature) => {
  const tokenFeatures = getSetting(state, "token-features");
  return tokenFeatures[feature];
};
