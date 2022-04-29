# People can't log in to Metabase

## Do you know how your logins are managed?
- [Metabase][metabase-idp]
- [SSO][troubleshooting-sso]
- [LDAP][troubleshooting-ldap]
- [I don't know how my logins are managed][how-to-find-idp].

## Metabase
- [I can't access the login page][no-login-page].
- [I can't log in to my Metabase Cloud account][metabase-cloud-login].
- [I forgot my password][how-to-reset-password].
- [I forgot the admin password][how-to-reset-admin-password].
- [I want to delete an account that was set up incorrectly][how-to-delete-an-account].

### I can't access the Metabase login page.

- [Are you using the right URL for your Metabase?][incorrect-metabase-url]
- [Has your Metabase account been deactivated?][deactivated-metabase-account]

#### Are you using the right URL for your Metabase?

1. Check whether you need to include a port number as well as a hostname in the connection URL. For example, Metabase might be at `https://example.com:3000/` instead of `https://example.com/`.
   - If you're an administrator, you'll have configured this.
   - If you're not, please ask your admin.
2. Check whether your Metabase instance has moved. For example, if you were using a trial instance of Metabase, but you're now in production, the URL might have changed.

#### Has your Metabase account been deactivated?

For obvious reasons, regular users can't reactivate deactivated accounts. If you're an administrator and you want to do this for someone else:

1. Go to **Admin Panel** and select **People**.
2. If no **Deactivated** tab is available, there are no deactivated accounts, so this isn't the problem.
3. If there _is_ a **Deactivated** tab, look for the user who isn't able to log in.
4. Click on the recycle loop arrow to reactivate the account.

## I can't log in to my Metabase Cloud account

Your Metabase store password is different from your Metabase Cloud admin password.

- [I forgot my Metabase store password][reset-store-password].
- [I forgot my Metabase Cloud password][how-to-reset-admin-password].

## SSO

- [Troubleshooting SAML][troubleshooting-saml]
- [SSO creates "unknown" users](https://github.com/metabase/metabase/issues/15484).

If you are an administrator, you can go to **Admin Panel** and select **People**, then search for a user and look for an icon beside their name. If they log in using Google credentials, Metabase displays a Google icon. If they log in using an email address and password stored in Metababse, no icon is shown. Note that the type of user is set when the account is first created: if you create a user in Metabase, but that person then logs in via Google or some other form of SSO, the latter's icon will _not_ show up next to their name.

If you are an administrator and want to check SSO settings, go to **Admin Panel**, choose **Settings**, then select the **Authentication** tab. [This FAQ][auth] explains how to configure SSO for various providers.

## I don't know how my logins are managed

What do you use to log in?

- An email address and password
  You're using [Metabase][metabase-idp] or [LDAP][troubleshooting-ldap].

- A button that launches a [pop-up dialog][sso-gloss].
  You're using [SSO][troubleshooting-sso].

- A site that doesn't have `.metabase.com` in the URL.
  You're using an embedded application. If a Metabase question or dashboard is embedded in another website or web application, that site or application determines who you are. It may pass on your identity to Metabase to control what data you are allowed to view---please see [our troubleshooting guide for sandboxing][sandboxing] if you are having trouble with this.

- I'm signing in at `store.metabase.com` instead of `metabase.com`.
  If you are using Metabase Cloud, the password for the Metabase store (where you pay for things) is not automatically the same as the password for your Metabase instance (where you log in to look at data).

Metabase can manage accounts itself, or administrators can configure it to let people log in using credentials managed by some other service.

### Further reading

- [SSO][sso-docs]
- [SAML-based authentication][saml-docs]
- [LDAP][ldap-docs]

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides, search or ask the [Metabase community][discourse].


[auth]: ../administration-guide/sso.html
[deactivated-metabase-account]: #has-your-metabase-account-been-deactivated
[how-to-delete-an-account]: ../administration-guide/04-managing-users.md#deleting-an-account
[discourse]: https://discourse.metabase.com/
[how-to-find-idp]: #i-dont-know-how-my-logins-are-managed
[how-to-reset-admin-password]: ../administration-guide/04-managing-users.html#resetting-the-admin-password
[how-to-reset-password]: ../administration-guide/04-managing-users.html#resetting-someones-password
[incorrect-metabase-url]: #are-you-using-the-right-url-for-your-metabase
[ldap-docs]: /administration-guide/10-single-sign-on.html#enabling-ldap-authentication
[metabase-cloud-login]: #i-cant-log-in-to-my-metabase-cloud-account
[metabase-idp]: #metabase
[no-login-page]: #i-cant-access-the-metabase-login-page
[reset-store-password]: https://store.metabase.com/forgot-password
[saml-docs]: ../enterprise-guide/authenticating-with-saml.html
[sandboxing]: ./sandboxing.html
[sso-docs]: /administration-guide/sso.html
[sso-gloss]: /glossary/sso.html
[troubleshooting-ldap]: ./ldap.html
[troubleshooting-saml]: ./saml.html
[troubleshooting-sso]: #sso
