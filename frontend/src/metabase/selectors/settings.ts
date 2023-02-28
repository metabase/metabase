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

interface UpgradeUrlOpts {
  utm_media: string;
}

export const getUpgradeUrl = createSelector(
  (state: State) => getUtmSource(state),
  (state: State, opts: UpgradeUrlOpts) => opts.utm_media,
  (source, media) => {
    const url = new URL("https://www.metabase.com/upgrade/");
    url.searchParams.append("utm_source", source);
    url.searchParams.append("utm_media", media);

    return url.toString();
  },
);

const getUtmSource = (state: State) => {
  const features = getSetting(state, "token-features");

  if (features.sso) {
    return features.hosting ? "pro-cloud" : "pro-self-hosted";
  } else {
    return features.hosting ? "starter" : "oss";
  }
};
