import { createSelector } from "@reduxjs/toolkit";

import { getPlan } from "metabase/common/utils/plan";
import type { TokenStatus, Version } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getSettings: <S extends State>(state: S) => GetSettings<S> =
  createSelector(
    (state: State) => state.settings,
    (settings) => settings.values,
  );

export const getSettingsLoading = createSelector(
  (state: State) => state.settings,
  (settings) => settings.loading,
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

export const isSsoEnabled = (state: State) =>
  getSetting(state, "ldap-enabled") ||
  getSetting(state, "google-auth-enabled") ||
  getSetting(state, "saml-enabled") ||
  getSetting(state, "other-sso-enabled?");

export type StorePaths =
  /** store main page */
  | ""
  /** checkout page */
  | "checkout"
  /** plans management page */
  | "account/manage/plans"
  /** development instance specific upsell */
  | "account/new-dev-instance"
  /** redirects to the specific instance storage management page */
  | "account/storage"
  /** EE, self-hosted upsell that communicates back with the instance */
  | "checkout/upgrade/self-hosted";

const DEFAULT_STORE_URL = "https://store.metabase.com/";

export function getStoreUrl(state: State, path: StorePaths = "") {
  try {
    const storeUrl = getSetting(state, "store-url");
    const url = new URL(path, storeUrl);
    return url.toString();
  } catch {
    return DEFAULT_STORE_URL;
  }
}

export const migrateToCloudGuideUrl = () =>
  "https://www.metabase.com/cloud/docs/migrate/guide";

export const getLearnUrl = (path = "") => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This is the implementation of getLearnUrl()
  return `https://www.metabase.com/learn/${path}`;
};

export const CROWDIN_URL = "https://crowdin.com/project/metabase-i18n";

export type UtmProps = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

type UrlWithUtmProps = { url: string } & UtmProps;

export const getUrlWithUtm = createSelector(
  (state: State, props: UrlWithUtmProps) => props,
  (state: State) => getPlan(getSetting(state, "token-features")),
  (props: UrlWithUtmProps, plan: string) => {
    const {
      utm_source = "product",
      utm_medium,
      utm_campaign,
      utm_content,
    } = props;

    const url = new URL(props.url);
    url.searchParams.set("utm_source", utm_source);
    if (utm_medium) {
      url.searchParams.set("utm_medium", utm_medium);
    }
    if (utm_campaign) {
      url.searchParams.set("utm_campaign", utm_campaign);
    }
    if (utm_content) {
      url.searchParams.set("utm_content", utm_content);
    }
    url.searchParams.set("source_plan", plan);

    return url.toString();
  },
);

interface DocsUrlProps {
  page?: string;
  anchor?: string;
  utm?: UtmProps;
}

export const getDocsUrl = (state: State, props: DocsUrlProps) => {
  const version = getSetting(state, "version");
  const url = getDocsUrlForVersion(version, props.page, props.anchor);

  if (!props.utm) {
    return url;
  }

  return getUrlWithUtm(state, { url, ...props.utm });
};

export const getDocsSearchUrl = (query: Record<string, string>) =>
  `https://www.metabase.com/search?${new URLSearchParams(query)}`;

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

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This function is only used by this file and "metabase/lib/settings"
  return `https://www.metabase.com/docs/${tag}/${page}${anchor}`;
};

interface UpgradeUrlOpts {
  utm_campaign?: string;
  utm_content: string;
}

export const getUpgradeUrl = createSelector(
  (state: State) => getPlan(getSetting(state, "token-features")),
  (state: State) => getSetting(state, "active-users-count"),
  (_state: State, utmTags: UpgradeUrlOpts) => utmTags,
  (plan, count, utmTags) => {
    const url = new URL("https://www.metabase.com/upgrade");
    const searchParams = {
      utm_source: "product",
      utm_medium: "upsell",
      utm_campaign: utmTags.utm_campaign,
      utm_content: utmTags.utm_content,
      source_plan: plan,
    };
    for (const key in searchParams) {
      const utmValue = searchParams[key as keyof typeof searchParams];
      if (utmValue) {
        url.searchParams.append(key, utmValue);
      }
    }
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

export const getTokenStatus = (state: State): TokenStatus | null =>
  getSetting(state, "token-status");
