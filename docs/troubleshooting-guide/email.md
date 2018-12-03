

## Troubleshooting Process

1. Verify the Email Account Credentials
    a. In the admin panel email settings, click "Send test email", and verify that the email is delivered to the test account
    b.If the email is not sent or returns an error, try to use the same account credentials in another program and see if they work. If they do, it might be a bug, please report it at github.com/metabase/metabase/issues/new

2. Is the email being sent? 
    a. Check the server logs for any error messages
    b. If there are any error messages, they are usually helpful :wink:
    c. If you have access to your email delivery service's outbound queue or a dashboard, check that for errors. 
    d. Some email delivery services have very specific rules regarding valid "from" addresses, make sure you've whitelisted the "from" address you're using in Metabase
    e. Some email delivery services have test modes or otherwise restricted delivery. Double check that your delivery service allows you to send email to the domain you're trying to get email sent to.

3. If the email is being sent, but you're not getting it, is anyone else getting theirs?
    a. If so, check your spam folder, any forwarding rules, etc
    b. If someone at another email provider is getting emails, this is probably due to deliverability rules, and you should look into signing your emails with DKIM, etc.

4. For user accounts specifically, did you previously create an account under this email and then delete it? This occasionally results in that email address being "claimed".

5. Make sure that the HOSTNAME is being set correctly. EC2 instances in particular have those set to the local ip, and some email delivery services such as GMail will error out in this situation.

## Specific Problems:

### Specific Problem:

###  Metabase can't send email via Office365

We see users report issues with sending email via Office365. We recommend using a different email delivery service if you can. 
https://github.com/metabase/metabase/issues/4272
