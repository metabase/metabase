# The Metabase Application Database

Metabase stores information about users, questions, and so on in a database of its own that we call the "application database". If the application cannot do this, it will not run.

## Specific Problems

### Metabase fails to start due to database locks

Sometimes Metabase will fail to complete its startup due to a database lock that was not cleared properly. The error message will look something like:

```
liquibase.exception.DatabaseException: liquibase.exception.LockException: Could not acquire change log lock.
```

When this happens, open a shell on the server where Metabase is installed and run:

```
java -jar metabase.jar migrate release-locks
```

This command will manually clear the locks. When it's done, restart your Metabase instance.

### Metabase H2 application database gets corrupted

By default, Metabase uses [H2][what-is-h2] for its application database. Because H2 is an on-disk database, it's sensitive to filesystem errors, such as a drive being corrupted or a file not being flushed properly. In these situations, you'll see errors on startup. These vary, but one example is:

```
myUser@myIp:~$ java -cp metabase.jar org.h2.tools.RunScript -script whatever.sql -url jdbc:h2:~/metabase.db
Exception in thread "main" org.h2.jdbc.JdbcSQLException: Row not found when trying to delete from index """"".I37: ( /* key:7864 */ X'5256470012572027c82fc5d2bfb855264ab45f8fec4cf48b0620ccad281d2fe4', 165)" [90112-194]
    at org.h2.message.DbException.getJdbcSQLException(DbException.java:345)
    [etc]
```

Not all H2 errors are recoverable (which is why if you're using H2, _please_ have a backup strategy for the application database file). To attempt to recover a corrupted H2 file with a recent version of Metabase, try the commands shown below:

```
java -cp metabase.jar org.h2.tools.Recover
mv metabase.db.mv.db metabase.old.db
touch metabase.db.mv.db
java -cp target/uberjar/metabase.jar org.h2.tools.RunScript -script metabase.db.h2.sql -url jdbc:h2:`pwd`/metabase.db
```

If you're using a legacy Metabase H2 application database (where the database file is named 'metabase.db.h2.db') use the command below instead:

```
java -cp metabase.jar org.h2.tools.Recover
mv metabase.db.h2.db metabase.old.db
touch metabase.db.h2.db
java -cp target/uberjar/metabase.jar org.h2.tools.RunScript -script metabase.db.h2.sql -url jdbc:h2:`pwd`/metabase.db;MV_STORE=FALSE
```

### Metabase fails to connect to H2 Database on Windows 10

In some situations on Windows 10, the Metabase JAR needs to have permissions to create local files for the application database. If the Metabase JAR lacks permissions, you might see an error message like this when running the JAR:

```
Exception in thread "main" java.lang.AssertionError: Assert failed: Unable to connect to Metabase DB.
```

You can unblock the file by right-clicking on it, clicking "Properties," and then clicking "Unblock." See [Microsoft's documentation][ms-unblocking-file] for more details on unblocking downloaded files.

[ms-unblocking-file]: https://blogs.msdn.microsoft.com/delay/p/unblockingdownloadedfile/
[what-is-h2]: /faq/setup/what-is-h2.html
