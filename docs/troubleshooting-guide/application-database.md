## Specific Problems:


### Metabase fails to start due to database locks

Sometimes Metabase will fail to complete its startup due to a database lock that was not cleared properly. The error message will look something like:

    liquibase.exception.DatabaseException: liquibase.exception.LockException: Could not acquire change log lock.

When this happens, go to a terminal where Metabase is installed and run:

    java -jar metabase.jar migrate release-locks

in the command line to manually clear the locks. Then restart your Metabase instance.

### Metabase H2 application database gets corrupted

Because H2 is an on-disk database, it is sensitive to filesystem errors. Sometimes drives get corrupted, or the file doesn't get flushed correctly, which can result in a corrupted database. In these situations, you'll see errors on startup. These vary, but one example is 
```
myUser@myIp:~$ java -cp metabase.jar org.h2.tools.RunScript -script whatever.sql -url jdbc:h2:~/metabase.db
Exception in thread "main" org.h2.jdbc.JdbcSQLException: Row not found when trying to delete from index """"".I37: ( /* key:7864 */ X'5256470012572027c82fc5d2bfb855264ab45f8fec4cf48b0620ccad281d2fe4', 165)" [90112-194]
    at org.h2.message.DbException.getJdbcSQLException(DbException.java:345)
    [etc]
```

Not all H2 errors are recoverable (which is why if you're using H2, _please_ have a backup strategy for the application database file). To attempt to recover a corrupted H2 file, try the below.

```
java -cp metabase.jar org.h2.tools.Recover
mv metabase.db.mv.db metabase.old.db
touch metabase.db.mv.db
java -cp target/uberjar/metabase.jar org.h2.tools.RunScript -script metabase.db.h2.sql -url jdbc:h2:`pwd`/metabase.db
```

NOTE: If you are using a legacy Metabase H2 application database (where the database file is named 'metabase.db.h2.db'), use the below instead. 

```
java -cp metabase.jar org.h2.tools.Recover
mv metabase.db.h2.db metabase.old.db
touch metabase.db.h2.db
java -cp target/uberjar/metabase.jar org.h2.tools.RunScript -script metabase.db.h2.sql -url jdbc:h2:`pwd`/metabase.db;MV_STORE=FALSE
```


### Metabase fails to connect to H2 Database on Windows 10

In some situations the Metabase JAR needs to be unblocked so it has permissions to create local files for the application database.

On Windows 10, if you see an error message like

    Exception in thread "main" java.lang.AssertionError: Assert failed: Unable to connect to Metabase DB.

when running the JAR, you can unblock the file by right-clicking, clicking "Properties," and then clicking "Unblock."
See Microsoft's documentation [here](https://blogs.msdn.microsoft.com/delay/p/unblockingdownloadedfile/) for more details on unblocking downloaded files.
