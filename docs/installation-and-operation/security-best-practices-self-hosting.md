---
title: Security best practices for a self-hosted Metabase
summary: Harden a self-hosted Metabase by keeping it patched, protecting secrets, encrypting traffic, and limiting access to your data.
---

# Security best practices for a self-hosted Metabase

This guide covers the Metabase-specific controls for hardening a self-hosted Metabase.

## Keep Metabase patched

Run a [supported version](https://www.metabase.com/version-support) and [upgrade](./upgrading-metabase.md) promptly when security fixes are released.

- **Pro and Enterprise:** Enable [Security Center](./security-center.md) notifications.
- **Open Source:** Monitor [Metabase security advisories](https://github.com/metabase/metabase/security/advisories) and [releases](https://github.com/metabase/metabase/releases).

## Protect secrets and data at rest

- Generate two secret keys by running `openssl rand -base64 32` twice: one for `MB_ENCRYPTION_SECRET_KEY`, and one for `MB_SESSION_SECRET_KEY`. Store both values in a secrets manager and use the same pair on every Metabase node.
- Set [`MB_ENCRYPTION_SECRET_KEY`](../configuring-metabase/environment-variables.md#mb_encryption_secret_key) to encrypt supported sensitive values in the application database, including database credentials and MFA secrets. Store and back up the key separately; losing the encryption key can make encrypted values unrecoverable. For an existing instance, follow the [one-time encryption procedure](../databases/encrypting-details-at-rest.md) before normal startup.
- Set [`MB_SESSION_SECRET_KEY`](../configuring-metabase/environment-variables.md#mb_session_secret_key) to sign stored session-key hashes, so application-database access alone cannot create usable sessions. Use at least 16 random characters; changing it logs out all active sessions. Available in 58.31.1, 59.30, 60.26, 61.20, 62.18, 63.15, and 64.0.
- Use a [production application database](./configuring-application-database.md) (not H2) and [back it up](./backing-up-metabase-application-data.md) regularly. Encrypt application-database, data-warehouse, and backup storage with your infrastructure, and test restores.
- In Metabase 58.33.1+, 63.16.9+, or 64+, set [`MB_DISABLE_LEGACY_STARTUP_ENCRYPTION`](../configuring-metabase/environment-variables.md#mb_disable_legacy_startup_encryption) to `true`.

## Protect network access

Put your Metabase behind a reverse proxy or load balancer that you control, and don't expose your Metabase's port directly to the internet. Add firewall or WAF rules to limit who can reach your Metabase.

## Encrypt traffic with TLS

You can encrypt traffic to Metabase in one of two ways:

1. By terminating TLS at your trusted load balancer or reverse proxy: set [`MB_SITE_URL`](../configuring-metabase/environment-variables.md#mb_site_url) to `https://<hostname>` and [`MB_REDIRECT_ALL_REQUESTS_TO_HTTPS`](../configuring-metabase/environment-variables.md#mb_redirect_all_requests_to_https) to `true`. On the proxy, send `X-Forwarded-Proto: https`. Restrict access to Metabase’s HTTP port to the proxy and trusted internal systems.
2. By terminating TLS [directly in Metabase](../configuring-metabase/customizing-jetty-webserver.md#using-https-with-metabase).

Also use [TLS with certificate validation](../databases/ssl-certificates.md) for the application database and connected data sources.

## Harden authentication and access

- **Pro and Enterprise:** Prefer [SCIM](../people-and-groups/user-provisioning.md) and [SAML or OIDC SSO](../people-and-groups/start.md#sso-for-metabase-pro-and-enterprise-plans) with MFA enforced at your identity provider, then [disable password logins](../people-and-groups/changing-password-complexity.md#disable-password-logins) after testing recovery access. If password or LDAP login remains enabled, use native [two-factor authentication](../people-and-groups/two-factor-authentication.md) (available in Metabase 63.1+; you can require enrollment in 64+).
- **Open Source:** Use [Google Sign-in or LDAP](../people-and-groups/start.md#sso-for-metabase-open-source-and-starter-plans) where practical. If [password](../people-and-groups/changing-password-complexity.md) login remains enabled, set [`MB_PASSWORD_COMPLEXITY`](../configuring-metabase/environment-variables.md#mb_password_complexity) to `strong-enough`, and leave [`MB_PASSWORD_LENGTH`](../configuring-metabase/environment-variables.md#mb_password_length) unset or set it to at least 15.
- **All editions:** Keep [administrator accounts](../people-and-groups/managing.md#administrators) to a minimum and deactivate accounts that are no longer needed.

## Limit access to data

- Connect Metabase to each data source using a dedicated [read-only database user](../databases/users-roles-privileges.md#recommended-setup) limited to the required schemas and tables. Use separate, narrowly scoped writable connections only for features that need them.
- Metabase [permissions are additive](../permissions/introduction.md#key-points-regarding-permissions): if a person belongs to multiple groups, the most permissive access wins. Restrict **All Users** first; new instances give the All Users group [Curate access to Our analytics](https://www.metabase.com/learn/metabase-basics/administration/permissions/collection-permissions#reviewing-the-default-collection-permissions).
- **Open Source:** View data cannot be restricted by Metabase group; [Can view is fixed](../permissions/data.md#view-data-permissions). Use database roles or separate connections to keep sensitive data out of reach.

## Centralize logs

Send [Metabase logs](../monitor/application-logs.md), application database logs, and proxy or load balancer logs to your logging or SIEM system.

## Secure the surrounding infrastructure

Apply your organization's security requirements and an established framework, such as the [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework), to the rest of your deployment.
