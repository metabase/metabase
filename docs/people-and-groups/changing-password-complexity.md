---
title: Passwords
redirect_from:
  - /docs/latest/operations-guide/changing-password-complexity
summary: Configure required password complexity for your Metabase instance. 
---

# Passwords

Metabase can allow authentication via email and password.

## Password complexity

The default password complexity for both Metabase instances and Metabase Store acccounts is minimum 15 characters.

On self-hosted Metabases, you can configure required password complexity through environment variables:

```sh
export MB_PASSWORD_COMPLEXITY=<complexity_level>
export MB_PASSWORD_LENGTH=10
```
You can set either `MB_PASSWORD_COMPLEXITY` or `MB_PASSWORD_LENGTH` independently. 

The options for complexity level are:

- `weak`: no constraints.
- `normal`: at least 1 digit.
- **`strong-enough`: minimum 15 characters (default)**.
- `strong`:  minimum 8 characters w/ 2 lowercase, 2 uppercase, 1 digit, and 1 special character

By default, Metabase also prevents users from setting passwords that are in a list of common passwords (like `qwerty123` and
`passw0rd`). Changing the complexity requirement to `weak` disables this behavior.

## Disable password logins

{% include plans-blockquote.html feature="Disabling password logins" %}

On Pro and Enterprise plans, you can require people to log in with SSO by disabling password authentication from **Admin** > **Settings** > **Authentication** > **Overview**.

## Change a password

You can change your password in [Account settings](account-settings.md).

## Reset a password

See [Resetting passwords](managing.md#resetting-someones-password).
