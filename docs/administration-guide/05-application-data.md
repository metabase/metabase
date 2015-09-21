
##Backing up Metabase Application Data 
---
###If you're using an Embedded Database
Find the file `metabase.db.h2.db`.  If your system is inactive, you can make a copy directly.  If your system is active, shut down the Metabase process and make a backup copy of the file.  Then, restart the server.

###If you're using Amazon RDS for the Database Application
Enable automated RDS Backups.  Instructions can be found [here](http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html).  

###If you're using a self-managed PostgreSQL or MySQL database
Back up your database as you would to any other PostgreSQL or MySQL database. 
