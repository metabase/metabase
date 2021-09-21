# People can't log in to Metabase

You should be able to log in to Metabase, but:

- you can't see the login page, or
- your credentials aren't accepted.

## Do you know who is managing your login?

**Background:** Metabase can manage accounts itself, or administrators can configure it to let people log in using credentials managed by some other service, such as Google, [SAML-based authentication][saml], or [LDAP][troubleshooting-ldap]. Metabase questions and dashboards can also be embedded in other websites.

**Scenarios:**

1. If Metabase is managing your account, or if your instance is using LDAP, you will typically log in directly using an email address and password.
2. If some other service (like Google) is managing your credentials, you will typically see a single button that launches a pop-up dialog when you log in.
3. If a Metabase question or dashboard is embedded in another website or web application, that site or application determines who you are. It may pass on your identity to Metabase to control what data you are allowed to view---please see [our troubleshooting guide for sandboxing][sandboxing] if you are having trouble with this.
4. If you are using Metabase Cloud, the password for the Metabase store (where you pay for things) is not automatically the same as the password for your Metabase instance (where you log in to look at data).

If you are an administrator, you can go to **Admin Panel** and select **People**, then search for a user and look for an icon beside their name. If they log in using Google credentials, Metabase displays a Google icon. If they log in using an email address and password stored in Metababse, no icon is shown. Note that the type of user is set when the account is first created: if you create a user in Metabase, but that person then logs in via Google or some other form of SSO, the latter's icon will *not* show up next to their name.

If you are an administrator and want to check SSO settings, go to **Admin Panel**, choose **Settings**, then select the **Authentication** tab.  [This FAQ][auth] explains how to configure SSO for various providers.

## Do you need to reset your password?

**Root cause:** You have forgotten your password.

**Steps to take:**

1. As noted above, if you are logging in via Single Sign-On, your password is managed by that service, not by Metabase, so you need to reset your password there.
2. If you are using the desktop Mac App, click on the **Help** menu item and select `Reset Password`.
3. If you are an administrator and want to reset someone's passsword, go to **Admin Panel**, select **People**, click on the ellipsis "..." next to the person's account, and select `Reset Password`.
4. If you are using the web app as a normal user:
   1. Click the link in the lower-right of the login screen that reads, "I seem to have forgotten my password".
   2. If your Metabase administrator has [set up email][setting-up-email] you will receive a password reset email.
   3. If email has not been configured, you will need to contact a Metabase admin to perform a password reset.

## If you are using Metabase Cloud, are you trying to use the correct password?

**Root cause:** You are trying to log in to Metabase Cloud using the password you set for the Metabase store.

**Steps to take:**

1. Check which password you are using.
2. If you cannot remember the Metababse Cloud admin password, please see the next entry.

## Do you need to reset the admin password?

**Root cause:** You have forgotten the overall admin password for a Metabase instance.

**Steps to take:**

If you are using Metabase Cloud, contact support to have your admin password reset.

If you're the administrator of a Metabase instance and have access to the server console, but have forgotten the password for the admin account, you can get Metabase to send you a password reset token:

1.  Stop the running Metabase application.
2.  Restart Metabase with `reset-password email@example.com`, where "email@example.com" is the email associated with the admin account:
    ```
    java -jar metabase.jar reset-password email@example.com
    ```
3.  This will print out a random token like this:
    ```
    ...
    Resetting password for email@example.com...

    OK [[[1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89]]]
    ```
4.  Start Metabase normally again (*without* the `reset-password` option).
5.  Navigate to it in your browser using the path `/auth/reset_password/:token`, where ":token" is the token that was generated from the step above. The full URL should look something like this:
    ```
    https://metabase.example.com/auth/reset_password/1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89
    ```
6.  You should now see a page where you can input a new password for the admin account.

## Are you using the right URL for your Metabase?

**Root cause:** the Metabase instance you are trying to log in to isn't where you think it is or isn't accessible.

**Steps to take:**

1. Check whether you need to include a port number as well as a hostname in the connection URL. For example, Metabase might be at `https://example.com:3000/` instead of `https://example.com/`.
   - If you're an administrator, you'll have configured this.
   - If you're not, please ask your admin.
2. Check whether your Metabase instance has moved. For example, if you were using a trial instance of Metabase, but you're now in production, the URL might have changed.

## If Metabase is managing your password, has your account been deactivated?

**Root cause:** Metabase doesn't delete accounts, but admins can deactivate them, and if your account is deactivated, you can't log in with it.

**Steps to take:**

For obvious reasons, regular users can't reactivate deactivated accounts. If you're an administrator and you want to do this for someone else:

1. Go to **Admin Panel** and select **People**.
2. If no **Deactivated** tab is available, there are no deactivated accounts, so this isn't the problem.
3. If there *is* a **Deactivated** tab, look for the user who isn't able to log in.
4. Click on the recycle loop arrow to reactivate the account.

## If you're logging in via LDAP, is LDAP configured correctly?

**Root cause**: The LDAP connection is not configured correctly.

**Steps to take:**

1.  Go to the **Admin Panel** and choose **Authentication**.
2.  Make sure that LDAP is enabled
3.  Make sure Metabase has the correct host, port, and login credentials for your LDAP server. You can test this by logging into LDAP directly using some other application, such as [Apache Directory Studio][ads].

[ads]: https://directory.apache.org/studio/
[auth]: ../faq/setup/how-do-i-integrate-with-sso.html
[reset-password]: ../faq/using-metabase/how-do-i-reset-my-password.html
[saml]: ..//enterprise-guide/authenticating-with-saml.html
[setting-up-email]: ../administration-guide/02-setting-up-email.html
[troubleshooting-ldap]: ./ldap.html
