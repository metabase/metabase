import { createSelector } from "@reduxjs/toolkit";

import { sessionApi } from "metabase/api/session";
import { getPlan } from "metabase/common/utils/plan";
import type { State } from "metabase/redux/store";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
  TokenFeature,
  TokenStatus,
  Version,
} from "metabase-types/api";

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
} = sessionApi.endpoints.getSessionProperties.select();

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
    window.MetabaseBootstrap ??
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

export const isSsoEnabled = (state: State) =>
  getSetting(state, "ldap-enabled") ||
  getSetting(state, "google-auth-enabled") ||
  getSetting(state, "saml-enabled") ||
  getSetting(state, "other-sso-enabled?");

export const getIsHosted = (state: State): boolean => {
  return getSetting(state, "is-hosted?");
};

export const getTokenFeature = (state: State, feature: TokenFeature) => {
  const tokenFeatures = getSetting(state, "token-features");
  return tokenFeatures[feature];
};

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
  | "checkout/upgrade/self-hosted"
  /** transforms add-ons management page */
  | "account/transforms";

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
  searchQuery?: string;
  utm?: UtmProps;
}

export const getDocsUrl = (state: State, props: DocsUrlProps) => {
  const url = props.searchQuery
    ? `https://www.metabase.com/search?${new URLSearchParams({
        query: props.searchQuery,
      })}`
    : getDocsUrlForVersion(
        getSetting(state, "version"),
        props.page,
        props.anchor,
      );

  if (!props.utm) {
    return url;
  }

  return getUrlWithUtm(state, { url, ...props.utm });
};

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

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This function is only used by this file and "metabase/utils/settings"
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
    for (const [key, utmValue] of Object.entries(searchParams)) {
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
