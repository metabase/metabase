# Administration Guide
It is assumed you've already installed a copy of Metabase. If you need help doing that, check out our [Installation Guide](installation-guide.md)


## Managing databases
To see a list of all databases click on "Databases"

### Adding a database connection
Click on "add database". 
you can currently add databases of types

* H2
* MySQL
* Postgres

for each you'll need the approriate connection information. 


### SSL
when you first add a database, we'll try to connect with and without ssl. if ssl is possible, we'll mark it as an ssl connection as a first choice. you can change this after addition

### Deleting databases
you can delete a database by either clicking "Remove this database" under "connection details" or hovering over the database row in the list and clicking on the red "Delete" button. Be extra careful when doing this because it's not reversible and all saved questions and dashboard cards based on this database will be deleted.

### metadata syncing
after a database is connected and the connection is validated, we'll get all the table and column schema information.
we'll also do this on a nightly basis
To sync manually, click on a database in this list, click on "connection details" and click syn

### database analysis
we'll try to guess your field types based on name
we'll also pull out a sample of each table and look for urls, json encoded strings, etc
if we get it wrong you can edit it later

## Setting up email
Once you've connected to a database, the next thing you should do is set up email. Email is used to reset passwords, onboarding new users and notifying you when something happens. 

### Setting it up

* set up an smtp server
* if you use google apps, credentials will be from X
* if you use SES, credentials from X
* if you use mandrill, you can get crendentials from X
* SSL is preferred here
* if your email service has a whitelist of email addresses that are allowed to send email, make sure to set the "Sender of system notifications" setting to a whitelisted email address

## Metadata editing
a full description of the metadata Metabase understands and takes advantage of can be found in our [Metadata Guide](metadata-guide.md)

### Tables

* add description to let people know what the table contains and how it can be used
* descriptions will be displayed in the data model reference
* control visibility by hiding
* once you've hidden a field, you should give us the reason 

### Fields

* if metabase got the field type wrong, you should update it here.
* adding a description allows users to understand what the field contains 
* a description is especially useful when the fields have values that are abbreviations or encoded in some way
* descriptions will be displayed in the data model reference

## Managing user accounts

* if you click on "people" you can see a list of all user accounts on this system
* you can add accounts by clicking "Add person" and telling Metabase their name and email
* once you have added them, they will get an email and a link where they can set their password
* to make a user an admin click on "grant admin"
* to remove admin priveledges click on "revoke admin"
* to delete an account, click on "remove". Note that this will delete all the cards this user has created.
