---
title: Two-factor authentication
summary: Add a second step to logins by having people confirm their identity with an authenticator app. A Pro/Enterprise feature.
---

# Two-factor authentication

{% include plans-blockquote.html feature="Two-factor authentication" %}

Two-factor authentication (2FA) adds a second step to signing in. On top of people's email and password logins, they'll have to confirm their identity with a time-based code from an authenticator app.

Metabase's native 2FA applies to password logins and LDAP logins. 2FA for Single Sign-on (SSO) via JWT, SAML, or OIDC is managed through your identity provider.

## Turn on two-factor authentication

An admin can turn 2FA on for your Metabase:

1. Go to **Admin settings** > **Settings** > **Authentication**.
2. Find the **Two-factor authentication** card.
3. Toggle it to **Enabled**.
Once enabled, a **Security** tab shows up in each person's account settings, where they can enroll in 2FA.

If you configure Metabase through environment variables or a [config file](../configuring-metabase/config-file.md), the matching setting is [`MB_MFA_ENFORCEMENT`](../configuring-metabase/environment-variables.md#mb_mfa_enforcement). Set `MB_MFA_ENFORCEMENT` to `optional` to let people enroll, or `off` to turn 2FA off.

## Supported methods

- **Authenticator app (primary).** People scan a QR code with an app like Google Authenticator or 1Password, which then generates a new six-digit code every 30 seconds.
- **Email code (fallback at login).** If an admin has set up [email](../configuring-metabase/email.md), people who are already enrolled in two-factor authentication can have Metabase email them a one-time code when they can't reach their authenticator app. You can only use the code once, and expires after ten minutes. If email isn't configured, Metabase hides this option.
- **Recovery codes.** When someone enrolls in 2FA, Metabase gives them ten single-use codes to save.

Metabase doesn't support SMS codes or hardware keys (passkeys, U2F, or WebAuthn).

## Before you turn on two-factor authentication

### If you're self-hosting Metabase, set an encryption key

Set the [`MB_ENCRYPTION_SECRET_KEY`](../databases/encrypting-details-at-rest.md) environment variable so Metabase encrypts authenticator secrets at rest. If you turn on 2FA without it, Metabase shows a warning on the settings page.

If you're using Metabase Cloud, we've encrypted your keys for you.

### Set up email for the fallback code

Metabase requires people to use an email address as a login, but that doesn't mean that email is set up. The email fallback only appears if your Metabase can send [email](../configuring-metabase/email.md). If you skip setting up email, people will have to rely on their authenticator app and recovery codes only.

## See who's enrolled

When 2FA is on, go to **Admin settings** > **Settings** > **Authentication** > **Two-factor authentication**. The 2FA card shows how many people have enrolled in 2FA and how many haven't.

## Further reading

- [Enrolling in two-factor authentication](./account-settings.md#two-factor-authentication)
- [Authentication options](./start.md#authentication)
