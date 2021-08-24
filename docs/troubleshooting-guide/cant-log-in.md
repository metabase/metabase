# People can't log in to Metabase

You should be able to log in to Metabase, but:

- you can't see the login page, or
- your credentials aren't accepted.

## Are you using the right URL for your Metabase?

- Do you have the port as well as the host?
- Has someone moved the Metabase instance (e.g., it was in dev and now it's in production)?

## Does your Metabase use Single Sign-On (SS0) to manage accounts?

- Other steps depend on knowing this
The tell here should be obvious when they sign in. They should have an option to use the third party identity provider, or "sign in with email".

## if your account is managed by Metabase...

### Has your account been deactivated?

- Metabase doesn't delete accounts, but admins can deactivate them
- Go to Admin Panel > People
- If there is no "Deactivated" tab, there are no deactivated accounts
- If there is a "Deactivated" tab, look for the user in question
- Click on the "recycle" loop arrow to reactivate the account

### Are you using the correct ID and password?

- [This FAQ][reset-password] explains how to reset your own password
- Admins can also go to Admin Panel > People > "..." > "Reset password"

# How do I reset my password?

## Using the Mac App

If you're running the MacOS application on your laptop, click on the Help menu item and select `Reset Password`.

## Using the web app as a normal user

Click the link in the lower-right of the login screen that reads, "I seem to have forgotten my password". If your Metabase administrator has already [set up email][setting-up-email] you will receive a password reset email. If email has not been configured, you will need to contact a Metabase admin to perform a password reset, which they can do by going to the Admin Panel and selecting the People tab.

## Using the web app as an administrator

If you're the administrator of Metabase and have access to the server console, but have forgotten the password for your admin account, you can get Metabase to send you a password reset token. To do this, stop the running Metabase application, then start Metabase with the parameters `reset-password email@example.com` (where "email@example.com" is the email associated with the admin account).

```
java -jar metabase.jar reset-password email@example.com
```

This will return a token. Stop Metabase again like this:

```
...
Resetting password for email@example.com...

OK [[[1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89]]]
```

Now start Metabase normally again and navigate to it in your browser, using the path `/auth/reset_password/:token`, where ":token" is the token that was generated from the step above. The full URL should look like this:

```
https://metabase.example.com/auth/reset_password/1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89
```

You should now see a page where you can input a new password for the admin account.

[setting-up-email]: ../administration-guide/02-setting-up-email.html


## If your account is managed by Single Sign-On...

Metabase can't reset passwords for SSO: for example, if you are logging in using your Google ID, Google is managing your password, not Metabase, and for obvious security reasons, Google won't let other applications reset people's passwords.

- Go to Admin Panel > Settings > Authentication
- After that, consult [this FAQ][auth]

### Are LDAP groups and attributes set up correctly?

- See [this tutorial][ldap-learn] for steps

[auth]: ../faq/setup/how-do-i-integrate-with-sso.html
[ldap-learn]: /learn/embedding/ldap-auth-access-control.html
[reset-password]: ../faq/using-metabase/how-do-i-reset-my-password.html
