---
title: Multi-factor authentication
---

# Multi-factor authentication

{% include plans-blockquote.html feature="Multi-factor authentication" %}

Metabase can require a second factor — a code from an authenticator app — when people sign in with email/password or LDAP. Logins through an SSO identity provider (SAML, JWT, OIDC, Google) aren't affected; your identity provider handles MFA for those.

## Turning on multi-factor authentication

Admins can turn on MFA in **Admin settings** > **Settings** > **Authentication**. Once it's on, people can set up two-factor authentication for their own account; it's optional per person.

If your Metabase doesn't have `MB_ENCRYPTION_SECRET_KEY` set, authenticator secrets are stored unencrypted in the application database. We strongly recommend [setting an encryption key](../databases/encrypting-details-at-rest.md).

## Setting up two-factor authentication for your account

1. Go to **Account settings** > **Security**.
2. Confirm your password (people who sign in with LDAP confirm their directory password).
3. Add the setup key or link to an authenticator app (Google Authenticator, 1Password, Authy, and so on).
4. Enter the 6-digit code the app shows to confirm.

When you confirm, Metabase shows your **recovery codes** — once. Save them somewhere safe, like a password manager. Treat them like passwords: anyone with a recovery code and your password can sign in as you.

## Signing in with a second factor

After you enter your password, Metabase asks for the 6-digit code from your authenticator app. A code that just rotated still works for a few extra seconds, and entering a wrong code doesn't send you back to the password step.

If you don't have your authenticator:

- **Use a recovery code.** Each recovery code works exactly once.
- **Email me a code.** If your Metabase can send email, you can have a single-use code sent to your account's email address. It expires after 10 minutes.

## Recovery codes

- You get 10 recovery codes when you set up two-factor authentication.
- Each code can only be used once.
- You can generate a new set from **Account settings** > **Security** by confirming with a current authenticator code or an unused recovery code. Generating a new set invalidates all of the old codes.
- Metabase stores only hashes of your recovery codes; nobody — including admins — can view them after the one time they're shown.

## If someone is locked out

Admins can remove a person's two-factor enrollment (the person gets an email when this happens). After that, the person signs in with just their password and can set up two-factor authentication again from scratch. There's nothing to "reset": the authenticator secret only exists on the person's device and in the (encrypted) application database.

Password resets don't bypass the second factor: a reset changes the password, but the person still goes through the normal, gated sign-in.

## If your license lapses

Enforcement never weakens silently: people who have two-factor authentication set up keep getting challenged, and they can still sign in, use recovery codes, and turn their own enrollment off. What a lapsed license blocks is *new* setup — enabling the instance setting and starting new enrollments.

## Security notes

- This defends against attacks that never touch your server: phishing and credential stuffing against interactive logins. It is not a control that survives a compromised host, database, or admin account.
- Someone who can replace the Metabase jar (for example, swapping in the open-source build) can remove enforcement — anyone who can do that already controls the host.
- Codes follow RFC 6238 (TOTP): SHA-1, 6 digits, 30-second steps — the defaults every major authenticator app uses.
