import { createSelector } from "@reduxjs/toolkit";

import type { Settings, SettingKey, TokenFeatures } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getSettings = createSelector(
  (state: State) => state.settings,
  settings => settings.values,
);

export const getSetting = <T extends SettingKey>(
  state: State,
  key: T,
): Settings[T] => getSettings(state)[key];

interface UpgradeUrlOpts {
  utm_media: string;
}

export const getUpgradeUrl = createSelector(
  (state: State) => getUtmSource(getTokenFeatures(state)),
  (state: State) => getSetting(state, "active-users-count"),
  (state: State, opts: UpgradeUrlOpts) => opts.utm_media,
  (source, count, media) => {
    const url = new URL("https://www.metabase.com/upgrade");
    url.searchParams.append("utm_media", media);
    url.searchParams.append("utm_source", source);
    if (count != null) {
      url.searchParams.append("utm_users", String(count));
    }

    return url.toString();
  },
);

const getUtmSource = (features: TokenFeatures) => {
  if (features.sso) {
    return features.hosting ? "pro-cloud" : "pro-self-hosted";
  } else {
    return features.hosting ? "starter" : "oss";
  }
};

const getTokenFeatures = (state: State) => getSetting(state, "token-features");

export const getIsPaidPlan = createSelector(
  getTokenFeatures,
  (features: TokenFeatures) => {
    return features.sso || features.hosting;
  },
);
