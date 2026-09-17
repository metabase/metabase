import { match } from "ts-pattern";
import { t } from "ttag";

import type {
  AdminSessionEndReason,
  AdminSessionType,
  AdminSessionUser,
} from "metabase-types/api";

import type { SessionsTimePreset } from "./SessionsPage/types";

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

export const getTimePresetLabel = (preset: SessionsTimePreset): string =>
  match(preset)
    .with("hour", () => t`Past hour`)
    .with("day", () => t`Past day`)
    .with("week", () => t`Past week`)
    .with("month", () => t`Past month`)
    .exhaustive();

export const getEndReasonLabel = (reason: AdminSessionEndReason): string =>
  match(reason)
    .with("admin", () => t`Revoked by admin`)
    .with("logout", () => t`Signed out`)
    .with("password-change", () => t`Password changed`)
    .with("user-deactivated", () => t`User deactivated`)
    .with("tenant-deactivated", () => t`Tenant deactivated`)
    .with("sso-logout", () => t`SSO logout`)
    .with("support-grant-revoked", () => t`Support access revoked`)
    .with("expired", () => t`Expired`)
    .with("timed-out", () => t`Timed out`)
    .exhaustive();
