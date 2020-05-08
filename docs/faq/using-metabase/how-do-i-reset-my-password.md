## How do I reset my password?

### Using the Mac App

If you're running the MacOS application on your laptop, you can click on the Help menu item and click `Reset Password`.

### Using the web app as a normal user

If you're having trouble logging in due to a forgotten password, click the link that reads, "I seem to have forgotten my password" in the lower-right of the log-in screen. If your Metabase administrator has already [configured your email settings](../../administration-guide/02-setting-up-email.md), you'll receive a password reset email. If email has not been configured, you will need to contact a Metabase admin to perform a password reset via Admin Panel > People.

### Using the web app as an administrator

If you're the administrator of Metabase and have access to the server console, but have forgotten the password for your admin account, then you can get a reset token, which can be used to setup a new password.

To get the token, stop the running Metabase application, then start Metabase with the parameters `reset-password email@example.com` (where "email@example.com" is the email associated with the admin account).

Example: `java -jar metabase.jar reset-password email@example.com`

This will return a token and stop Metabase again, like this:

```
...
Resetting password for email@example.com...

OK [[[1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89]]]
```

Now start Metabase normally again and navigate to the URL where you're running it, with the following path appended: `/auth/reset_password/:token`, where ":token" is the token that was generated from the step above.

Example: `https://metabase.example.com/auth/reset_password/1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89`

You should now see a page where you can input a new password for the admin account.
