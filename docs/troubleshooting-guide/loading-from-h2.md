## Loading exported application database fails 

If you've been using the default H2 application database that ships with Metabase, and want to [migrate from the default H2 application database][migrate] to a production database like [PostgreSQL][postgres], you'll need to use the `load-from-h2` command, which will fail if the database filename is incorrect. 

### How to detect this

When running the `load-from-h2` command, you'll see an error:

```
Command failed with exception: Unsupported database file version or invalid file header in file <YOUR FILENAME> 
```

### How to fix this

First, make sure to create a copy of the exported H2 database (see [Backing up Metabase Application Data][backup]).

Next, check that the exported, application database file (the H2 database you exported) is named "metabase.db.mv.db". H2 automatically adds a `.h2.db` or `.mv.db` extension to the database path you specify, so make sure the path to the DB file you pass to the command is exactly `metabase.db.mv.db`

or example, if you've exported an application database, and you want to load the data from that H2 database into a PostgreSQL database using `load-from-h2`, your command will look something like:

```
export MB_DB_TYPE=postgres
export MB_DB_DBNAME=metabase
export MB_DB_PORT=5432
export MB_DB_USER=<username>
export MB_DB_PASS=<password>
export MB_DB_HOST=localhost
java -jar metabase.jar load-from-h2 /path/to/metabase.db.mv.db
```

On a related note, if you're using Metabase Enterprise Edition, you might want to check out the [Serialization][serialization-docs] feature to snapshot your application database. Serialization is useful when you want to [preload questions and dashboards][serialization-learn] in a new Metabase.

[backup]: ../operations-guide/backing-up-metabase-application-data.md
[serialization-docs]: ../enterprise-guide/serialization.md
[serialization-learn]: ../../learn/administration/serialization.md
[posgres]: https://www.postgresql.org/
[migrate]: ../operations-guide/migrating-from-h2.md