import { t } from "ttag";

import type {
  OAuthClient,
  OAuthClientRegistrationType,
  OAuthClientUser,
} from "metabase-types/api";

/** What to call a client in the UI. A dynamically registered client need not have sent a name. */
export const getOAuthClientName = (client: OAuthClient): string =>
  client.client_name || t`Unnamed client`;

/** The admin who revoked a client. Nothing for an active one, or a revoked one whose admin has been deleted. */
export const getRevokerName = (client: OAuthClient): string | undefined =>
  client.revoked_by?.common_name ?? client.revoked_by?.email;

/** How a client came to be registered. Every client registers dynamically today; `static` is a legacy stamp. */
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

/** What to call a user who connected a client. A user need not have given a name. */
export const getOAuthClientUserName = (user: OAuthClientUser): string =>
  user.common_name ?? user.email;
