---
title: Metabase isn't sending email
---

# Metabase isn't sending email

You have told Metabase to send email notifications, but:

- the notifications aren't arriving.

Before any other troubleshooting, try sending a test email to isolate the problem.

## Can you successfully send a test email?

**Root cause:** The host, port, email address, or password may have been set up incorrectly, or the email server's host and port have been set up incorrectly.

**Steps to take:**

1. Navigate to the __Admin Panel__ and click __Email__ in the left sidebar.
2. Confirm that your host, port, email address, and password are entered correctly. If they are, click __Save changes__. If your changes have successfully saved, you'll see an option to __Send test email__.
3. Click __Send test email__. The test email will go the address associated with your Metabase account.
4. Verify that the email is delivered to your account.
5. If the message is not sent or an error message is displayed in Metabase, try to use the same account credentials in another email program and see if they work. See the logs for more detailed error by navigating to __Troubleshooting__ and click __Logs__ in the left sidebar.

## Is the mail server actually sending the message?

**Root cause:** Some email delivery services have very specific rules regarding valid "from" addresses, or have test modes that restrict delivery.

**Steps to take:**

1. Check that your delivery service allows you to send email to the domain you're trying to get email sent to. (Exactly how to do this depends on the delivery service you're connecting to.)
2. Make sure you've whitelisted the "from" address that you're using for Metabase.
3. Check the mail server's logs for any error messages.
4. If you have access to your email delivery service's outbound queue or a dashboard, check that for errors as well.

## Is the mail being sent but not arriving?

**Root cause:** The message is being sent correctly, but isn't being received (at least, not where you expect it to be).

**Steps to take:**

1. Check whether email sent to other accounts is arriving, e.g., are colleagues receiving their notifications?
2. If so, check your spam folder, any forwarding rules you have set up, etc.
3. Check whether you're using the same email provider as the people who are receiving their messages. If not, the problem might be with deliverability rules---look into signing your emails with [DomainKeys Identified Mail][dkim] (DKIM).

[bugs]: ./bugs.md
[dkim]: https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail
[office-365-bug]: https://github.com/metabase/metabase/issues/4272
