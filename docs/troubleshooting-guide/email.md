# Email

Metabase can be configured to send email notifications to get people's attention if and when something requires it.

## Troubleshooting Process

1. Are the email account credentials correct?
    a. In the Admin Panel, select "Email Settings", click "Send test email", and verify that the email is delivered to the test account.
    b.If the email is not sent or returns an error, try to use the same account credentials in another program and see if they work. If they do, it might be a bug---please [report it](./bugs.html).

2. Is the email being sent? 
    a. Check the server logs for any error messages.
    b. If you have access to your email delivery service's outbound queue or a dashboard, check that for errors as well. 
    c. Some email delivery services have very specific rules regarding valid "from" addresses. Make sure you've whitelisted the "from" address you're using in Metabase.
    d. Some email delivery services have test modes or otherwise restricted delivery. Double check that your delivery service allows you to send email to the domain you're trying to get email sent to.

3. If the email is being sent, but you're not getting it, is anyone else getting theirs?
    a. If so, check your spam folder, any forwarding rules you have set up, etc.
    b. If someone at another email provider is getting emails, this is probably due to deliverability rules. Please look into signing your emails with [DomanKeys Identified Mail][dkim] (DKIM).

4. Check whether you previously created an account using this email address and then deleted it. Doing this occasionally results in that email address being "claimed".

5. Make sure that the HOSTNAME is being set correctly. EC2 instances in particular have those set to the local IP address, and some email delivery services such as GMail will report errors in this situation.

## Specific Problems

### Metabase can't send email via Office365

Some people have [reported problems sending email via Office365][office-365-bug]. We recommend using a different email delivery service if you can. 

[dkim]: https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail
[office-365-bug]: https://github.com/metabase/metabase/issues/4272
