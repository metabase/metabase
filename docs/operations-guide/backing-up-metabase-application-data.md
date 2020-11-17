# Backing up Metabase Application Data

If you are using Metabase in a production environment or simply want to make sure you don't lose any of the work that you've done, then backups are what you need.

Metabase uses a single SQL database for all of its runtime application data, so all you need to do is backup that database and you're good to go.  From a database back-up you can restore any Metabase installation.

### H2 Embedded Database (default)
If you launched Metabase on a laptop or PC the application will create an embedded H2 database in the directory it is being run in.  Navigate to the directory where you started Metabase from and find the file named `metabase.db.h2.db` or `metabase.db.mv.db` (you will see one of the two depending on when you first started using Metabase).  Simply copy that file somewhere safe and you are all backed up!

NOTE: If your Metabase is currently running it's best to shut down the Metabase process before making a backup copy of the file.  Then, restart the application.

### Amazon RDS for the Database Application
Amazon has its own best practices on how to backup and restore RDS databases, so we'll defer to them.  We recommend that you enable automated RDS Backups.

Instructions can be found in the [Amazon RDS User Guide](http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html).

### Self-managed PostgreSQL or MySQL database
Simply follow the same instructions you would use for making any normal database backup.  It's a large topic more fit for a DBA to answer, but as long as you have a dump of the Metabase database you'll be good to go.