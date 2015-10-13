
## Backing up Metabase Application Data 
Metabase keeps a database of all your saved questions, user accounts, activity, and more. If you’d like to back up this application database, the way to do this differs based on your configuration:

### If you're using an embedded database
Find the file `metabase.db.h2.db`. If Metabase isn’t running, you can make a copy directly. If your system is active, shut down the Metabase process and make a backup copy of the file. Then restart the server.

### If you're using Amazon RDS for the application database
Enable automated RDS Backups. Instructions can be found [here](http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html).  

### If you're using a self-managed PostgreSQL or MySQL database
Back up your database as you would any other PostgreSQL or MySQL database.

---
## Next: configuring Metabase
There are a few other settings you configure in Metabase. [Learn how](06-configuration-settings.md).