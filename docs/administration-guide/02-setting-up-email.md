
##Setting up Email

---
Once you connect your database to Metabase, you'll want to configure an email account to send system notifications to your organization's users.  Metabase uses email to reset passwords, onboard new users, and notify you when something happens.  

###Configuring your Email Account

For Metabase to send and receive messages to your organization's users, you'll need to set up an email account to send emails via SMTP (*SMTP* stands for simple mail transfer protocol and is an email standard used that secures emails with SSL security protection). 

![heemailcredentials](images/EmailCredentials.png)

**If you use Google Apps:**

* Enter the email address you would like to be used as the sender of system notifications in the 
* In the **SMTP host** field, enter [smtp.gmail.com](smtp.gmail.com)
* Enter your Google Apps password in the **SMTP password** field
* Fill in `465` for the **SMTP port** field
* For the **SMTP secure connection protocol** field, enter *TLS*
* In the **SMTP username** field, enter your Google Apps email address (e.g. hello@yourdomain.com)


**If you use SES:**

* Log onto [https://console.aws.amazon.com/ses](https://console.aws.amazon.com/ses). 
* Click **SMTP Settings** from the navigation pane.  
* Select **Create My SMTP Credentials** in the content pane. 
* Create a user in the **Create User for SMTP** dialogy box and then click **Create**.  
* Afterwards select **Show User SMTP Credentials** to view the user's SMTP credentials.  

**If you use Mandrill:**

* Locate your credentials from the **SMTP & API Info** page from your Mandrill account.  
* Your SMTP password is any active API key for your account-*not* your Mandrill password.  
* Although Mandrill lists **port 587**, [any port supported by Mandrill](https://mandrill.zendesk.com/hc/en-us/articles/205582167-What-SMTP-ports-can-I-use-) will work for SMTP email.  

**No matter what email provider you use,**

* SSL is preferred because it is more secure and gives your account exta security and protection from threats.
* If your email service has a whitelist of email addresses that are allowed to send email, be sure to add the "Sender of System Notifications" setting to a whitelisted email address to ensure you receive all messages from Metabase.  
