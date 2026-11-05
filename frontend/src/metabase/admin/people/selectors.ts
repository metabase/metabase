import { createSelector } from "@reduxjs/toolkit";

import { ACTIVE_USERS_NUDGE_THRESHOLD } from "metabase/admin/people/constants";
import { getUserIsAdmin } from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { getSetting, hasAnySsoFeature } from "metabase/settings";
import type { EnterpriseSettingKey, User } from "metabase-types/api";

export const getUserTemporaryPassword = (
  state: State,
  props: { userId: number },
) => state.admin.people.temporaryPasswords[props.userId];

const SSO_SOURCE_ENABLED_SETTING = {
  google: "google-auth-enabled",
  ldap: "ldap-enabled",
  saml: "saml-enabled",
  jwt: "jwt-enabled",
  oidc: "oidc-enabled",
  slack: "slack-connect-enabled",
  scim: "scim-enabled",
} as const satisfies Record<
  NonNullable<User["sso_source"]>,
  EnterpriseSettingKey
>;

/**
 * Whether the user signs in through an SSO provider that is currently enabled.
 * Admins can't reset passwords for these users; once the provider is disabled
 * (or its license lapses) the user falls back to password login.
 */
export const getIsUserSsoSourceEnabled = (
  state: State,
  { sso_source }: Pick<User, "sso_source">,
): boolean =>
  sso_source != null &&
  Boolean(getSetting(state, SSO_SOURCE_ENABLED_SETTING[sso_source]));

export const shouldNudgeToPro = createSelector(
  (state) => getSetting(state, "token-features"),
  (state) => getUserIsAdmin(state),
  (state) => getSetting(state, "active-users-count"),
  (tokenFeatures, isAdmin, numActiveUsers) => {
    return (
      !hasAnySsoFeature(tokenFeatures) &&
      isAdmin &&
      numActiveUsers >= ACTIVE_USERS_NUDGE_THRESHOLD
    );
  },
);

export const shouldShowTenantsUpsell = createSelector(
  (state) => getSetting(state, "setup-embedding-autoenabled"),
  (state) => getSetting(state, "embedding-homepage"),
  (state) => getSetting(state, "token-features"),
  (wasEmbeddingAutoenabled, embeddingHomepage, tokenFeatures) => {
    // Older web setup flows only persisted this broader embedding interest
    // signal, while the SDK CLI already persisted setup-embedding-autoenabled.
    const hasEmbeddingSetupSignal =
      Boolean(wasEmbeddingAutoenabled) || embeddingHomepage === "visible";

    return hasEmbeddingSetupSignal && !tokenFeatures?.tenants;
  },
);
