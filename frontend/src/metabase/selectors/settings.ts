import { createSelector } from "@reduxjs/toolkit";

import { getPlan } from "metabase/common/utils/plan";
import type { TokenStatus, Version } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getSettings: <S extends State>(state: S) => GetSettings<S> =
  createSelector(
    (state: State) => state.settings,
    settings => settings.values,
  );

export const getSettingsLoading = createSelector(
  (state: State) => state.settings,
  settings => settings.loading,
);

type GetSettings<S extends State> = S["settings"]["values"];
type GetSettingKey<S extends State> = keyof GetSettings<S>;

export const getSetting = <S extends State, T extends GetSettingKey<S>>(
  state: S,
  key: T,
): GetSettings<S>[T] => {
  const settings = getSettings(state);
  const setting = settings[key];
  return setting;
};

export const getStoreUrl = (path = "") => {
  return `https://store.metabase.com/${path}`;
};

export const getLearnUrl = (path = "") => {
  // eslint-disable-next-line no-unconditional-metabase-links-render -- This is the implementation of getLearnUrl()
  return `https://www.metabase.com/learn/${path}`;
};

interface DocsUrlProps {
  page?: string;
  anchor?: string;
}

export const getDocsUrl = createSelector(
  (state: State) => getSetting(state, "version"),
  (state: State, props: DocsUrlProps) => props.page,
  (state: State, props: DocsUrlProps) => props.anchor,
  (version, page, anchor) => getDocsUrlForVersion(version, page, anchor),
);

export const getDocsSearchUrl = (query: Record<string, string>) =>
  `https://www.metabase.com/search?${new URLSearchParams(query)}`;

// should be private, but exported until there are usages of deprecated MetabaseSettings.docsUrl
export const getDocsUrlForVersion = (
  version: Version | undefined,
  page = "",
  anchor = "",
) => {
  let tag = version?.tag;
  const matches = tag && tag.match(/v[01]\.(\d+)(?:\.\d+)?(-.*)?/);

  if (matches) {
    if (
      matches.length > 2 &&
      matches[2] &&
      "-snapshot" === matches[2].toLowerCase()
    ) {
      // always point -SNAPSHOT suffixes to "latest", since this is likely a development build off of master
      tag = "latest";
    } else {
      // otherwise, it's a regular OSS or EE version string, just link to the major OSS doc link
      tag = "v0." + matches[1];
    }
  } else {
    // otherwise, just link to the latest tag
    tag = "latest";
  }

  if (page) {
    page = `${page}.html`;
  }

  if (anchor) {
    anchor = `#${anchor}`;
  }

  // eslint-disable-next-line no-unconditional-metabase-links-render -- This function is only used by this file and "metabase/lib/settings"
  return `https://www.metabase.com/docs/${tag}/${page}${anchor}`;
};

interface UpgradeUrlOpts {
  utm_media: string;
}

export const getUpgradeUrl = createSelector(
  (state: State) => getPlan(getSetting(state, "token-features")),
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

/**
 * ! The tokenStatus is only visible to admins
 */
export const getIsPaidPlan = createSelector(
  (state: State) => getSetting(state, "token-status"),
  (tokenStatus: TokenStatus | null) => {
    return tokenStatus != null && tokenStatus.valid;
  },
);
