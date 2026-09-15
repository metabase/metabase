import { match } from "ts-pattern";
import { t } from "ttag";

import type { AdminSessionType, AdminSessionUser } from "metabase-types/api";

export const getSessionUserName = (user: AdminSessionUser): string =>
  user.common_name ?? user.email;

export const getProviderLabel = (provider: string): string =>
  match(provider)
    .with("password", () => t`Password`)
    .with("ldap", () => t`LDAP`)
    .with("google", () => t`Google`)
    .with("slack-connect", () => t`Slack`)
    .with("custom-oidc", () => t`OIDC`)
    .with("jwt", () => t`JWT`)
    .with("saml", () => t`SAML`)
    .with("support-access-grant", () => t`Support access`)
    .with("unknown", () => t`Unknown`)
    .otherwise(() => provider);

export const getSessionTypeLabel = (type: AdminSessionType): string =>
  match(type)
    .with("normal", () => t`Normal`)
    .with("full-app-embed", () => t`Embedded`)
    .exhaustive();
