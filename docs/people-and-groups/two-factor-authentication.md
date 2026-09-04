---
title: Two-factor authentication
summary: Add a second step to logins by having people confirm their identity with an authenticator app. A Pro/Enterprise feature.
---

# Two-factor authentication

{% include plans-blockquote.html feature="Two-factor authentication" %}

Two-factor authentication (2FA) adds a second step to signing in. On top of people's email and password logins, they'll have to confirm their identity with a time-based code from an authenticator app.

Metabase's native 2FA applies to password logins and LDAP logins. 2FA for Single Sign-on (SSO) via JWT, SAML, or OIDC is managed through your identity provider.

## Enable two-factor authentication

To enable two-factor authentication:

1. Go to **Admin** > **Settings** > **Authentication** > **Overview**. <!-- TODO: verify path against branch -->
2. Scroll to the **Two-factor authentication** card.
3. Enable the **Allow two-factor authentication** toggle. Once enabled, people who log in with a password or LDAP can enroll in 2FA from the **Authentication** tab in their account settings.
4. In **Require two-factor authentication**, select an option:
   - **Don't require**: People can enroll in 2FA, but they don't have to. This is the default.
   - **Require now**: Metabase logs out everyone (including you) who hasn't logged in with 2FA. Anyone who hasn't enrolled sets up 2FA at their next login.
   - **Require by a certain date**: Under **Enrollment deadline**, select a date when 2FA becomes required for everyone.

Requiring 2FA doesn't affect API keys.

If you configure Metabase through environment variables or a [config file](../configuring-metabase/config-file.md), the matching setting is [`MB_MFA_ENFORCEMENT`](../configuring-metabase/environment-variables.md#mb_mfa_enforcement). Set `MB_MFA_ENFORCEMENT` to `optional` to let people enroll, `required` to make enrollment mandatory, or `off` to turn 2FA off.

To set the enrollment deadline, use [`MB_MFA_REQUIREMENT_DEADLINE`](../configuring-metabase/environment-variables.md#mb_mfa_requirement_deadline).

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

When 2FA is on, go to **Admin** > **Settings** > **Authentication** > **Overview** and scroll to the **Two-factor authentication** card. The card shows how many people have enrolled in 2FA and how many haven't. Click a count to see the list of people.

## Further reading

- [Enrolling in two-factor authentication](./account-settings.md#two-factor-authentication)
- [Authentication options](./start.md#authentication)
