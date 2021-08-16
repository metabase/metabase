# I can't see my tables

#refresh
If you have just setup the database in Metabase, then the sync process might not have completed. This process is usually very fast.
Yes: Check the progress in Admin > Troubleshooting > Logs. And do a browser refresh if it has completed sync successfully.
No (or on sync failure): Goto #synccheck

#newtable
If you have just added a table to your database, then it will not be available in Metabase until the sync-process is done, which is only run every hour by default.
Yes: Manually run sync via Admin > Databases > (db) > Sync database schema now. Goto #refresh.
No: Goto #synccheck

#admintable
Does the tables show up in Admin > Data Model, but cannot see it elsewhere?
Yes: Make sure that the table is not marked as hidden in the Data Model. Make sure it's available in Admin > Permissions > Data permissions. It could be a browser cache issue, goto #refresh.
No: Goto #synccheck

#synccheck
Can you run a simple query in Metabase referencing a missing table - Ask question > Native query > example `select count(*) from my_table` ?
Yes: Goto #syncfail
No: Check if the correct database is setup in Metabase, see Admin > Databases > (db). And make sure that Metabase has privileges to select the table in the database's user permissions.

#syncfail
Do you see sync errors in Admin > Troubleshooting > Logs?
Yes:
Seeing sync failures in the log can be difficult to decipher, but you can get help in the forum: https://discourse.metabase.com/
First do a search, if you don't find another exactly matching topic, then create a new topic and include the follow:
The full sync error stacktrace, "Diagnostic Info" from Admin > Troubleshooting, and which database type you're having problems with, and any other information you think might help.
No:
If you don't see any sync errors, then you might need to start Metabase with more debug logging.
Start Metabase with the environment variable `MB_NS_TRACE="metabase.sync"`
