# People can't log in to Metabase

You are supposed to be able to log in to Metabase, but:

- you can't see the login page, or
- your credentials aren't accepted.

## Are you using the right URL for your Metabase?

- Do you have the port as well as the host?
- Has someone moved the Metabase instance (e.g., it was in dev and now it's in production)?

## Does your Metabase use Single Sign-On (SS0) to manage accounts?

- Other steps depend on knowing this
- FIXME: can people look at their own profile to find out how their credentials are managed?
- FIXME: where in the Admin Panel can someone find this?

Note Metabase can't re-set passwords for SSO: if (for example) someone is logging in using their Google ID, they must re-set the Google password associated with that account.

## If the credentials are stored in Metabase, has the account been deactivated?

- Metabase doesn't delete accounts, but admins can deactivate them
- Go to Admin Panel > People
- If there is no "Deactivated" tab, there are no deactivated accounts
- If there is a "Deactivated" tab, look for the user in question
- Click on the "recycle" loop arrow to reactivate the account

## If the credentials are stored in Metabase, are they using the correct ID and password?

- [This FAQ][reset-password] explains how to re-set your own password
- Admins can also go to Admin Panel > People > "..." > "Reset password"

## If the account is managed by SSO, is SSO enabled?

- Go to Admin Panel > Settings > Authentication
- After that, consult [this FAQ][auth]

## If the account is managed by SSO, is the person using the correct credentials?

- There's not much we can do here

## Are LDAP groups and attributes set up correctly?

- See [this tutorial][ldap-learn] for steps

[auth]: ../faq/setup/how-do-i-integrate-with-sso.html
[ldap-learn]: /learn/embedding/ldap-auth-access-control.html
[reset-password]: ../faq/using-metabase/how-do-i-reset-my-password.html
