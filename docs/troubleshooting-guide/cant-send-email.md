# Metabase isn't sending email

You have told Metabase to send email notifications, but:

- the notifications aren't arriving.

## Are the email credentials correct?

**Root cause:** The email address and/or password have been set up incorrectly.

**Steps to take:**

1. In the Admin Panel, select "Email Settings" and click "Send test email"
2. Verify that the email is delivered to the test account.
3. If the message is not sent or an error message is displayed in Metabase, try to use the same account credentials in another email program and see if they work. If they do, you may have found a---please [report it][bugs].

## Is the HOSTNAME of the Metabase server set correctly?

**Root cause:** Some email delivery services, such as GMail, will report errors when the mail sender's HOSTNAME doesn't match the actual host's name. In particular, by default EC2 instances of Metabase set the hostname to the local IP address unless configured otherwise.

**Steps to take:**

1. Make sure that the HOSTNAME is being set correctly. FIXME where and how to do this? It doesn't seem to be in our docs.

## Is the mail server actually sending the message?

**Root cause:** Some email delivery services have very specific rules regarding valid "from" addresses, or have test modes that restrict delivery.

**Steps to take:**

1. Check that your delivery service allows you to send email to the domain you're trying to get email sent to. (Exactly how to do this depends on the delivery service you're connecting to.)
2. Make sure you've whitelisted the "from" address you're using for Metabase.
3. Check the mail server's logs for any error messages.
4. If you have access to your email delivery service's outbound queue or a dashboard, check that for errors as well. 

## Has the email address you're trying to send to been claimed by another account?

**Root cause:** When you create accounts directly in Metabase (as opposed to using third-party authentication), you must specify an email address. If you have created an account using an email address and deleted it, that address might still be marked as "claimed".

**Steps to take:**

1. Check other accounts you have created in Metabase itself to see if any of them are using the email address you're trying to use.
2. FIXME what then?

## Is the mail being sent but not arriving?

**Root cause:** The message is being sent correctly, but isn't being received (at least, not where you expect it to be).

**Steps to take:**

1. Check whether email sent to other accounts is arriving, e.g., are colleagues receiving their notifications?
2. If so, check your spam folder, any forwarding rules you have set up, etc.
3. Check whether you are using the same email provider as the people who are receiving their messages. If not, the problem might be with deliverability rules---please look into signing your emails with [DomainKeys Identified Mail][dkim] (DKIM).

## I can't send email via Office365

Some people have [reported problems sending email via Office365][office-365-bug]. We recommend using a different email delivery service if you can. 

[bugs]: ./bugs.html
[dkim]: https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail
[office-365-bug]: https://github.com/metabase/metabase/issues/4272
