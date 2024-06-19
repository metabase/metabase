---
title: Using or migrating from an H2 application database
---

# Using or migrating from an H2 application database

You've installed Metabase, but:

- You're trying to migrate the application database from H2 to another database and something has gone wrong,
- You're trying to downgrade rather than upgrade,
- Metabase logs a `liquibase` error message when you try to run it,
- Metabase logs another error message that mentions `H2` or `h2` while it is running, or
- You're on Windows 10 and get a warning about file permissions.

## Are you currently using H2 as your application database?

**Root cause:** Metabase stores information about users, questions, and so on in a database of its own called the "application database", or "app database" for short. By default Metabase uses H2 for the application database, but we don't recommended it for production---because it's an on-disk database, it's sensitive to filesystem errors, such as a drive being corrupted or a file not being flushed properly.

**Steps to take:**

1. To check what you're using as the app database, go to **Admin Panel**, open the **Troubleshooting** tab, scroll down to "Diagnostic Info", and look for the `application-database` key in the JSON it displays.
2. See [Migrating from H2](../installation-and-operation/migrating-from-h2.md) for instructions on how to migrate to a more robust app database.

## Are you trying to migrate the application database from H2 to something else?

**Root cause:** You are trying to [migrate](../installation-and-operation/migrating-from-h2.md) the app database from H2 to a production database such as PostgreSQL or MySQL/MariaDB using the `load-from-h2` command, but this has failed because the database filename is incorrect with an error message like:

```
Command failed with exception: Unsupported database file version or invalid file header in file <YOUR FILENAME>
```

**Steps to take:**

1.  Create a copy of the exported H2 database (see [Backing up Metabase Application Data][backup]). _Do not proceed until you have done this_ in case something goes wrong.

2.  Check that the H2 database file you exported is named `metabase.db.mv.db`.

3.  H2 automatically adds `.mv.db` extension to the database path you specify on the command line, so make sure the path to the DB file you pass to the command does _not_ include the `.mv.db` extension. For example, if you've exported an application database, and you want to load the data from that H2 database into a PostgreSQL database using `load-from-h2`, your command will look something like:

    ```
    export MB_DB_TYPE=postgres
    export MB_DB_DBNAME=metabase
    export MB_DB_PORT=5432
    export MB_DB_USER=<username>
    export MB_DB_PASS=<password>
    export MB_DB_HOST=localhost
    java -jar metabase.jar load-from-h2 /path/to/metabase.db # do not include .mv.db
    ```

If you're using a [Pro or Enterprise version of Metabase][enterprise], you can use [serialization][serialization-docs] to snapshot your application database. Serialization is useful when you want to [preload questions and dashboards][serialization-learn] in a new Metabase instance.

## Are you trying to downgrade?

**Root cause:** Metabase does not support downgrading (i.e., reverting to an early version of the application).

**Steps to take:**

1.  Shut down Metabase.
2.  Restore the backup copy of the app database you made before trying to upgrade or downgrade.
3.  Restore the JAR file or container of the older version you want to revert to.
4.  Restart Metabase.

## Is the app database locked?

**Root cause:** Sometimes Metabase fails to start up because an app database lock did not clear properly during a previous run. The error message looks something like:

```
liquibase.exception.DatabaseException: liquibase.exception.LockException: Could not acquire change log lock.
```

**Steps to take:**

1.  Open a shell on the server where Metabase is installed and manually clear the locks by running:

    ```
    java -jar metabase.jar migrate release-locks
    ```

2.  Once this command completes, restart your Metabase instance normally (_without_ the `migrate release-locks` flag).

## Is the app database corrupted?

**Root cause:** H2 is less reliable than production-quality database management systems, and sometimes the database itself becomes corrupted. This can result in loss of data in the app database, but can _not_ damage data in the databases that Metabase is connected.

**Steps to take:** Error messages can vary depending on how the app database was corrupted, but in most cases the log message will mention `h2`. A typical command and message are:

```
myUser@myIp:~$ java -cp metabase.jar org.h2.tools.RunScript -script whatever.sql -url jdbc:h2:~/metabase.db
Exception in thread "main" org.h2.jdbc.JdbcSQLException: Row not found when trying to delete from index """"".I37: ( /* key:7864 */ X'5256470012572027c82fc5d2bfb855264ab45f8fec4cf48b0620ccad281d2fe4', 165)" [90112-194]
    at org.h2.message.DbException.getJdbcSQLException(DbException.java:345)
    [etc]
```

**How to fix this:** not all H2 errors are recoverable (which is why if you're using H2, _please_ have a backup strategy for the application database file).

If you are running a recent version and using H2, the app database is stored in `metabase.db.mv.db`. - Open a shell on the server where the Metabase instance is running and attempt to recover the corrupted H2 file by running the following four commands:

```
java -cp metabase.jar org.h2.tools.Recover

mv metabase.db.mv.db metabase-old.db.mv.db

touch metabase.db.mv.db

java -cp target/uberjar/metabase.jar org.h2.tools.RunScript -script metabase.db.h2.sql -url jdbc:h2:`pwd`/metabase.db
```

## Are you running Metabase with H2 on Windows 10?

**Root cause:** In some situations on Windows 10, the Metabase JAR needs to have permissions to create local files for the application database. When running the JAR, you'll see an error message like this:

```
Exception in thread "main" java.lang.AssertionError: Assert failed: Unable to connect to Metabase DB.
```

**Steps to take:**

1.  Right-click on the Metabase JAR file (_not_ the app database file).
2.  Select "Properties".
3.  Select "Unblock."

## Is the application database taking too long to load?

**Root cause:** You're using H2 as your app database, and the app database is so large that it can't be loaded in less than 5 seconds (which is the default timeout value). You'll see the message "Timeout" appear in the console when you try to start Metabase.

**Steps to take:**

1.  Use a production-quality database such as PostgreSQL for the app database (preferred).
2.  Go to the **Admin Panel** and increase the timeout setting for the app database.
3.  Move Metabase to a faster server (in particular, a server with faster disks).

[backup]: ../installation-and-operation/backing-up-metabase-application-data.md
[enterprise]: https://www.metabase.com/pricing
[serialization-docs]: ../installation-and-operation/serialization.md
[serialization-learn]: https://www.metabase.com/learn/administration/serialization
