
## Setting up Email

Once you connect your database to Metabase, you'll want to configure an email account to send system notifications to your organization's users.  Metabase uses email to reset passwords, onboard new users, and notify you when something happens.

### Configuring your Email Account

For Metabase to send messages to your organization's users, you'll need to set up an email account to send emails via *SMTP* (simple mail transfer protocol), which is an email standard that secures emails with SSL security protection.

To start, go to the Admin Panel from the dropdown menu in the top right of Metabase, then from the Settings page, click on **Email** in the left menu.

You should see this form:

![Email Credentials](images/EmailCredentials.png)

**If you use Google Apps:**

* In the **SMTP host** field, enter smtp.gmail.com
* Fill in 465 for the **SMTP port** field
* For the **SMTP Security** field, enter **SSL**
* In the **SMTP username** field, enter your Google Apps email address (e.g. hello@yourdomain.com)
* Enter your Google Apps password in the **SMTP password** field
* Enter the email address you would like to be used as the sender of system notifications in the **From Address* field.

**If you use Amazon SES:**

* Log on to [https://console.aws.amazon.com/ses](https://console.aws.amazon.com/ses).
* Click **SMTP Settings** from the navigation pane.
* Select **Create My SMTP Credentials** in the content pane.
* Create a user in the **Create User for SMTP** dialog box and then click **Create**.
* Next, select **Show User SMTP Credentials** to view the user's SMTP credentials.
* Go back to the Metabase Admin Panel form and enter the info there.

**If you use Mandrill:**

* Log in to your Mandrill account and locate your credentials from the **SMTP & API Info** page there.
* Your SMTP password is any active API key for your account — *not* your Mandrill password.
* Although Mandrill lists **port 587**, [any port supported by Mandrill](https://mandrill.zendesk.com/hc/en-us/articles/205582167-What-SMTP-ports-can-I-use-) will work for SMTP email.
* Now you can go back to the Metabase Admin Panel form and enter the info there.

**No matter which email provider you use,**

* SSL is strongly recommended because it’s more secure and gives your account extra protection from threats.
* If your email service has a whitelist of email addresses that are allowed to send email, be sure to whitelist the email address that you put in the **From Address** field to ensure you and your teammates receive all emails from Metabase.

---

## Next: setting up Slack
If you want to use Slack to enhance the Metabase experience then lets do that now. Let’s learn [how to setup Slack](09-setting-up-slack.md).
