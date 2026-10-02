import { t } from "ttag";

import type { OAuthClient } from "metabase-types/api";

/** What to call a client in the UI. A dynamically registered client need not have sent a name. */
export const getOAuthClientName = (client: OAuthClient): string =>
  client.client_name || t`Unnamed client`;

/** The admin who revoked a client. Nothing for an active one, or a revoked one whose admin has been deleted. */
export const getRevokerName = (client: OAuthClient): string | undefined =>
  client.revoked_by?.common_name ?? client.revoked_by?.email;
