---
title: Two-factor authentication
summary: Add a second step to logins by having people confirm their identity with an authenticator app. A Pro/Enterprise feature.
---

# Two-factor authentication

{% include plans-blockquote.html feature="Two-factor authentication" %}

Two-factor authentication (2FA) adds a second step to signing in. On top of their email and password, people confirm their identity with a time-based code from an authenticator app, so a stolen password isn't enough to get into an account.

You (an admin) turn 2FA on for your Metabase, and people opt in from their own [account settings](./account-settings.md#two-factor-authentication). In this version, 2FA is available but not required, so it's up to each person to enroll.

## Supported methods

- **Authenticator app (primary).** People scan a QR code with an app like Google Authenticator, 1Password, or Authy, which then generates a new six-digit code every 30 seconds. This is the method everyone enrolls in first.
- **Email code (fallback at login).** If you've set up [email](../configuring-metabase/email.md), people who are already enrolled can have Metabase email them a one-time code when they can't reach their authenticator app. The code is single-use and expires after about ten minutes. If email isn't configured, Metabase hides this option.
- **Recovery codes.** When someone enrolls, Metabase gives them ten single-use codes to save. Each code signs them in once if they lose access to their authenticator app.

Metabase doesn't support SMS codes or hardware keys (passkeys, U2F, or WebAuthn).

## Before you turn on two-factor authentication

Set up these two things first so 2FA works well for everyone.

### Set an encryption key

Set the [`MB_ENCRYPTION_SECRET_KEY`](../databases/encrypting-details-at-rest.md) environment variable so Metabase encrypts authenticator secrets at rest. If you turn on 2FA without it, Metabase shows a warning on the settings page:

> Make sure to set the MB_ENCRYPTION_SECRET_KEY environment variable to encrypt authenticator secrets.

### Set up email for the fallback code

The email fallback only appears if your Metabase can send [email](../configuring-metabase/email.md). If you skip this, people will rely on their authenticator app and recovery codes only.

## Turn on two-factor authentication

1. Go to **Admin settings** > **Settings** > **Authentication**.
2. Find the **Two-factor authentication** card.
3. Toggle it to **Enabled**.

Once enabled, a **Security** tab shows up in each person's account settings, where they can enroll.

If you configure Metabase through environment variables or a [config file](../configuring-metabase/config-file.md), the matching setting is [`MB_MFA_ENFORCEMENT`](../configuring-metabase/environment-variables.md#mb_mfa_enforcement). Set it to `optional` to let people enroll, or `off` to turn 2FA off.

## See who's enrolled

When 2FA is on, the **Two-factor authentication** card shows how many people have enrolled and how many haven't. Since enrollment is up to each person in this version, these counts help you follow up with anyone who hasn't set it up yet.

The counts are the whole picture Metabase gives you here: there's no per-person status or admin control to remove someone's 2FA from the People page.

## Help someone who's locked out

Because there's no admin reset in this version, people need to recover access themselves, so make sure everyone knows their options before they enroll:

- Enter one of the **recovery codes** they saved during enrollment.
- If you've set up email, have Metabase **email a code** from the login screen.

Encourage people to store their recovery codes somewhere safe. Without a recovery code or the email fallback, someone who loses their authenticator app can't get back in.

## How 2FA changes logging in

Signing in becomes a two-step process: after entering their email and password, enrolled people enter a code before Metabase creates their session. See [logging in with two-factor authentication](./account-settings.md#logging-in-with-two-factor-authentication) for what people see.

Resetting a password doesn't skip the second step. When an enrolled person resets their password, Metabase still asks for their 2FA code before signing them in, so a password reset alone can't get around 2FA.

## Limitations in this version

- 2FA is opt-in. You can make it available, but you can't require people to enroll yet.
- There's no per-person status or 2FA removal on the People page. Admins see enrollment counts only.
- No SMS codes or hardware keys (passkeys, U2F, WebAuthn).

## Further reading

- [Enrolling in two-factor authentication](./account-settings.md#two-factor-authentication)
- [Authentication options](./start.md#authentication)
