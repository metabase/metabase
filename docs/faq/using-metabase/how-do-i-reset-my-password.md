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

[setting-up-email]: ../../administration-guide/02-setting-up-email.html
