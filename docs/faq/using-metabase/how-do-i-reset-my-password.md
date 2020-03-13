## How do I reset my password?

### Using the Mac App

If you're running the MacOS application on your laptop, you can click on the Help menu item and click `Reset Password`.

### Using the web version as an user

If you're having trouble logging in due to a forgotten password, click the `I seem to have forgotten my password` button in the lower right of the log-in screen. If your Metabase administrator has already [configured your email settings](../../administration-guide/02-setting-up-email.md), you will be able to generate a Reset Password email. If email has not been configured, you will need to contact them to perform a password reset via Admin Panel > People.

### Using the web version as an administrator

If you're the administrator of Metabase and have access to the server console, but have forgotten the password for your admin account, then you can get a reset token, which can be used to setup a new password.

To get the token, stop the existing Metabase, and start Metabase with the parameters `reset-password email@example.com` (where "email@example.com" would be the email you used to create the admin account).

Example: `java -jar metabase.jar reset-password email@example.com`

This will return a token and stop Metabase again, like this:

```
...
Resetting password for email@example.com...

OK [[[1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89]]]
```

Now start Metabase normally again and go to URL, which is where you're running Metabase from, with the location `/auth/reset_password/:token`

Example: `https://metabase.example.com/auth/reset_password/1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89`

You should now see a page, where you can input a new password, which will now be the password for the account you reset.
