# Migrating from using the H2 database to Postgres or MySQL/MariaDB

If you decide to use the default application database (H2) when you initially start using Metabase, but later decide that you'd like to switch to a more production-ready database such as Postgres or MySQL/MariaDB, you're in the right place.

## Before you migrate

- Avoid upgrading and migrating at the same time, since it can cause problems if one of the database schemas doesn't match.
- You must be able to connect to the target Postgres or MySQL/MariaDB database in whatever environment you're running this migration command in. So, if you are attempting to move the data to a cloud database, make sure you can connect to that database.

### Migrating when using Docker

We recommend running the migration outside of Docker. You'll need to copy the H2 file out of the Docker container before migrating. For example, if the container is called metabase, you'd run:

```
docker cp metabase:/metabase.db/metabase.db.mv.db ./
```

The above command would copy the database file to the directory you ran the command from. With your database file outside of the container, all you need to do is follow the "How to migrate" steps below.

## How to migrate 

Metabase provides a custom migration command for upgrading H2 application database files by copying their data to a new database. Here's what you'll do:

1. Shutdown your Metabase instance so that it's not running. This ensures no accidental data gets written to the db while migrating.
2. Make a backup copy of your H2 application database by following the instructions in [Backing up Metabase Application Data](backing-up-metabase-application-data.md). Safety first!
3. Run the Metabase data migration command using the appropriate environment variables for the target database you want to migrate to. You can find details about specifying MySQL and Postgres databases at [Configuring the application database](configuring-application-database.md). Here's an example of migrating to Postgres:

```
export MB_DB_TYPE=postgres
export MB_DB_DBNAME=metabase
export MB_DB_PORT=5432
export MB_DB_USER=<username>
export MB_DB_PASS=<password>
export MB_DB_HOST=localhost
java -jar metabase.jar load-from-h2 /path/to/metabase.db # do not include .mv.db
```

Note that the file name of the database file itself might be `/path/to/metabase.db.mv.db`, but when running the `load-from-h2` command, you need to truncate the path to `/path/to/metabase.db`.

Metabase expects that you'll run the command against a brand-new (empty) database; it'll create the database schema and migrate the data for you.

### PostgreSQL notes

-  Minimum version is PostgreSQL 9.4, since the code that handles these migrations uses a command that is only available in version 9.4 or newer.

### MySQL/MariaDB notes

- MySQL minimum recommended version is 5.7.7.
- MariaDB minimum recommended version is 10.2.2.
- And the following database settings are required (the settings are the default in the above recommended versions): `utf8mb4_unicode_ci` collation, `utf8mb4` character set, and `innodb_large_prefix=ON`.

### Troubleshooting

If you get an error, check out [Error when loading application database from H2](../troubleshooting-guide/loading-from-h2.md).
