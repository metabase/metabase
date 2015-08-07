#Administration Guide
---
If you haven't already installed a copy of Metabase, you'll need to do so.  If you need help doing that, check out our [Installation Guide](installation-guide.md).  

##Managing Databases
---

To see a list of all databases click on "Databases".

##Adding a Database Connection

Click on "Add database".  You can currently add the following types of databases:

* Amazon RDS
* H2
* MONGODB
* MySQL
* Postgres

For each type of database, you'll need the appropriate connection information.  For help finding your database type's connection information, check out our [Installation Guide](installation-guide.md).

##SSL

Metabase automatically tries to connect to databases with and without SSL.  If it is possible to connect to your database with a SSL connection, Metabase will mark an SSL connection as the default for your database. If you'd like, you can change this setting later.  

###Database Analysis

When connecting with your database, we try to decipher the field types in your table based on their name.  We also take a sample of each table to look for URL's, json, encoded strings, etc.  If we classify a field wrong, you can always edit it later.  

###Metadata Syncing

Metabase automatically syncs the table and column information from your database every night.  

To sync manually:

1. Click on your database.
2. Click on "Connection Details"
3. Select "Sync"

###Deleting Databases

You can delete a database from Metabase by either clicking "Remove this Database" under "Connection Details".  You can also delete it by hovering over the database row in the list and clicking on the red "Delete" button.

**Caution: Deleting a database is irreversible!  All saved questions and dashboard cards based on the database will be deleted too.**

##Setting up Email

---

Once you connect your database to Metabase, you'll want to configure your email settings.  Metabase uses email to reset passwords, onboard new users, and notify you when something happens.  

###Configuring your Email Account

* Set up an smtp server
* If you use Google Apps, you can find your credentials...
* If you use SES, your credentials are located
* If you use Mandrill, your credentials are...
* SSL is preferred because it is more secure and gives your account exta security and protection from threats.
* If your email service has a whitelist of email addresses that are allowed to send email, be sure to add the "Sender of System Notifications" setting to a whitelisted email address to ensure you receive all messages from Metabase.  

##Metadata Editing

---
*For an in-depth description of Metabase's understanding of metadata and how it uses it, check out our [Metadata Guide](metadata-guide.md)*

###What is metadata?
**Metadata** is data about other data.  It's data that tells you about the data found in your database.
###Tables 

* Add descriptions to tables to let people know type of data a table contains and how it can be used. 
* Descriptions are displayed in the data model reference.
* You can control visibility of metadata by hiding it. 
* If you hide a field, give Metabase a reason so it understands why a field is not being included.

###Fields 

* If Metabase misclassified the type of a field, you can update it here. 
* Add a description to a field, so users know what data it contains.
* Descriptions are extra helpful when fields have values that are abbreviated or coded in a particular format.
* Descriptions are displayed in the data model reference.

##Managing User Accounts
---

Click **People** from [Where do they click from] to see a list of all user accounts in your organization.

* To add a new user account, click **Add Person** and enter their name and email address.  

* New users will receive an email welcoming them to Metabase and a link to configure their password.
* To delete a user's account, click **Remove**.  Deleting an account will mark it as inactive and prevent it from being used in the future - but it won't delete the user's cards or dashboards.

* To make an existing user an administrator, click **Grant Admin**
* To remove administrator privileges from a user, select **Revoke Admin**

##Backing up Metabase Application Data 
---
###If you're using an Embedded Database
Find the file "metabase.db.h2.db".  If your system is inactive, you can make a copy directly.  If your system is active, shut down the Metabase process and make a backup copy of the file.  Then, restart the server.

###If you're using Amazon RDS for the Database Application
Turn on automated RDS backups.  

###If you're using a self-managed PostgreSQL or MySQL database
Back up your database as you would to any other PostgreSQL or MySQL database. 

##Settings
---
###Base URL
The **base URL** is used in emails to allow users to click to their specific instance.  Include the protocol (http vs https) to make sure it is reachable. 

###Connection Timezone
The **connection timezone** sets the default time zone for displaying times.  The timezone is used when doing date breakouts.  

Setting the default timezone will not change the timezone of any data in your database.  If the underlying times in your database aren't assigned to a timezone, Metabase will use the connection timezone as the default timezone.  

###Name used for the Instance
If you want to name an instance, you can do so under settings.  Many teams use the name of their company, but the choice is yours!
