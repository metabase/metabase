---
title: People can't log in to Metabase
---

# People can't log in to Metabase

## Do you know how your logins are managed?

- [Metabase][metabase-idp]
- [SSO][troubleshooting-sso]
- [LDAP][troubleshooting-ldap]
- [I don't know how my logins are managed][how-to-find-idp].

## Troubleshooting Metabase logins

- [I can't access the Metabase login page][no-login-page].
- [I can't log in to my Metabase Cloud account][metabase-cloud-login].
- [I forgot my password][how-to-reset-password].
- [I forgot the admin password][how-to-reset-admin-password].
- [I want to delete an account that was set up incorrectly][how-to-delete-an-account].

### I can't access the Metabase login page.

- [Are you using the right URL for your Metabase?][incorrect-metabase-url]
- [Ask your Metabase admin if your account has been deactivated][how-to-reactivate-account].

#### Are you using the right URL for your Metabase?

1. Check whether you need to include a port number as well as a hostname in the connection URL. For example, Metabase might be at `https://example.com:3000/` instead of `https://example.com/`.
   - If you're an administrator, you'll have configured this.
   - If you're not, please ask your admin.
2. Check whether your Metabase instance has moved. For example, if you were using a trial instance of Metabase, but you're now in production, the URL might have changed.

### Further reading

- [Configuration settings documentation][config-settings]

## Troubleshooting Metabase Cloud logins

If you're using [Metabase Cloud][pricing], note that your Metabase store password is different from your Metabase Cloud admin password.

- [I forgot my Metabase store password][reset-store-password].
- [I forgot my Metabase Cloud password][how-to-reset-admin-password].
- If you're a Metabase Cloud customer, you can [contact support][help-premium].

### Further reading

- [Metabase Cloud documentation][cloud-docs]

## Troubleshooting SSO logins

- [Troubleshooting SAML][troubleshooting-saml].
- [SSO logins are creating "unknown" users](https://github.com/metabase/metabase/issues/15484).

### Further reading

- [SSO documentation][sso-docs]
- [Checking a person's auth method][how-to-find-auth-method-for-an-account]

## I don't know how my logins are managed

What do you use to log in?

- **An email address and password.**

  You're using [Metabase][metabase-idp] or [LDAP][troubleshooting-ldap].

- **A button that launches a [pop-up dialog][sso-gloss].**

  You're using [SSO][troubleshooting-sso].

- **I'm signing in at a site that doesn't have `.metabase.com` in the URL.**

  You're using an embedded application. If a Metabase question or dashboard is embedded in another website or web application, that site or application determines who you are. It may pass on your identity to Metabase to control what data you are allowed to view---please see [our troubleshooting guide for sandboxing][sandboxing] if you are having trouble with this.

- **I'm signing in at `store.metabase.com`.**

  If you're using [Metabase Cloud][pricing], the password for the Metabase store (where you pay for things) is not automatically the same as the password for your Metabase instance (where you log in to look at data).

  If your password and URL are correct, go to [Troubleshooting Metabase Cloud logins][metabase-cloud-login].

### Further reading

- [SSO documentation][sso-docs]
- [SAML documentation][saml-docs]
- [LDAP documentation][ldap-docs]

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[cloud-docs]: /cloud/docs/
[config-settings]: ../administration-guide/08-configuration-settings.html
[deactivated-metabase-account]: #has-your-metabase-account-been-deactivated
[discourse]: https://discourse.metabase.com/
[help-premium]: https://www.metabase.com/help-premium/
[how-to-delete-an-account]: ../administration-guide/04-managing-users.html#deleting-an-account
[how-to-find-idp]: #i-dont-know-how-my-logins-are-managed
[how-to-find-auth-method-for-an-account]: ../administration-guide/04-managing-users.html#checking-someones-auth-method
[how-to-reactivate-account]: ../administration-guide/04-managing-users.html#reactivating-an-account
[how-to-reset-admin-password]: ../administration-guide/04-managing-users.html#resetting-the-admin-password
[how-to-reset-password]: ../administration-guide/04-managing-users.html#resetting-someones-password
[incorrect-metabase-url]: #are-you-using-the-right-url-for-your-metabase
[known-issues]: ./known-issues.html
[ldap-docs]: ../administration-guide/10-single-sign-on.html#enabling-ldap-authentication
[metabase-cloud-login]: #troubleshooting-metabase-cloud-logins
[metabase-idp]: #troubleshooting-metabase-logins
[no-login-page]: #i-cant-access-the-metabase-login-page
[pricing]: https://www.metabase.com/pricing/
[reset-store-password]: https://store.metabase.com/forgot-password
[saml-docs]: ../enterprise-guide/authenticating-with-saml.html
[sandboxing]: ./sandboxing.html
[sso-docs]: ../administration-guide/sso.html
[sso-gloss]: /glossary/sso.html
[troubleshooting-ldap]: ./ldap.html
[troubleshooting-saml]: ./saml.html
[troubleshooting-sso]: #troubleshooting-sso-logins