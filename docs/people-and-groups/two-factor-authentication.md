---
title: Two-factor authentication
summary: Add a second step to logins by having people confirm their identity with an authenticator app. A Pro/Enterprise feature.
---

# Two-factor authentication

{% include plans-blockquote.html feature="Two-factor authentication" %}

Two-factor authentication (2FA) adds a second step to signing in. On top of people's email and password logins, they'll have to confirm their identity with a time-based code from an authenticator app.

Metabase's native 2FA applies to password logins and LDAP logins. 2FA for Single Sign-on (SSO) via JWT, SAML, or OIDC is managed through your identity provider.

## Turn on two-factor authentication

An admin can turn 2FA on for your Metabase, and people opt in from their own [account settings](./account-settings.md#two-factor-authentication).

1. Go to **Admin settings** > **Settings** > **Authentication**.
2. Find the **Two-factor authentication** card.
3. Toggle it to **Enabled**.

Once enabled, a **Security** tab shows up in each person's account settings, where they can enroll.

If you configure Metabase through environment variables or a [config file](../configuring-metabase/config-file.md), the matching setting is [`MB_MFA_ENFORCEMENT`](../configuring-metabase/environment-variables.md#mb_mfa_enforcement). Set `MB_MFA_ENFORCEMENT` to `optional` to let people enroll, or `off` to turn 2FA off.

## Supported methods

- **Authenticator app (primary).** People scan a QR code with an app like Google Authenticator, 1Password, or Authy, which then generates a new six-digit code every 30 seconds. This is the method everyone enrolls in first.
- **Email code (fallback at login).** If you've set up [email](../configuring-metabase/email.md), people who are already enrolled can have Metabase email them a one-time code when they can't reach their authenticator app. The code is single-use and expires after about ten minutes. If email isn't configured, Metabase hides this option.
- **Recovery codes.** When someone enrolls, Metabase gives them ten single-use codes to save. Each code signs them in once if they lose access to their authenticator app.

Metabase doesn't support SMS codes or hardware keys (passkeys, U2F, or WebAuthn).

## Before you turn on two-factor authentication

### If you're self-hosting Metabase, set an encryption key

Set the [`MB_ENCRYPTION_SECRET_KEY`](../databases/encrypting-details-at-rest.md) environment variable so Metabase encrypts authenticator secrets at rest. If you turn on 2FA without it, Metabase shows a warning on the settings page.

If you're using Metabase Cloud, we've encrypted your keys for you.

### Set up email for the fallback code

The email fallback only appears if your Metabase can send [email](../configuring-metabase/email.md). If you skip this, people will rely on their authenticator app and recovery codes only.

## See who's enrolled

When 2FA is on, the **Two-factor authentication** card shows how many people have enrolled and how many haven't. Since enrollment is up to each person in this version, these counts help you follow up with anyone who hasn't set it up yet.

The counts are the whole picture Metabase gives you here: there's no per-person status or admin control to remove someone's 2FA from the People page.

## Further reading

- [Enrolling in two-factor authentication](./account-settings.md#two-factor-authentication)
- [Authentication options](./start.md#authentication)
