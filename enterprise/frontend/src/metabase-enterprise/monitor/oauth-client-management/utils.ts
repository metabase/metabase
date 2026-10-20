import { t } from "ttag";

import type {
  OAuthClient,
  OAuthClientRegistrationType,
  OAuthClientUser,
} from "metabase-types/api";

export const getOAuthClientName = (client: OAuthClient): string =>
  client.client_name || t`Unnamed client`;

export const getRevokerName = (client: OAuthClient): string | undefined =>
  client.revoked_by?.common_name ?? client.revoked_by?.email;

export const getRegistrationTypeLabel = (
  registrationType: OAuthClientRegistrationType,
): string => {
  switch (registrationType) {
    case "dynamic":
      return t`Dynamic`;
    case "static":
      return t`Static`;
  }
};

export const getOAuthClientUserName = (user: OAuthClientUser): string =>
  user.common_name ?? user.email;
