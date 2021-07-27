# Migrating from using the H2 database to MySQL or Postgres

If you decide to use the default application database (H2) when you initially start using Metabase, but later decide that you'd like to switch to a more production-ready database such as MySQL or Postgres, you're in the right place.

## Before you migrate

- Avoid upgrading and migrating at the same time, since it can cause problems with one of database schemas not matching.
- You must be able to connect to the target MySQL or Postgres database in whatever environment you're running this migration command in. So, if you are attempting to move the data to a cloud database, make sure you can connect to that database.

## How to migrate 

Metabase provides a custom migration command for upgrading H2 application database files by copying their data to a new database. Here's what you'll want to do:

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

It is expected that you will run the command against a brand-new (empty!) database; Metabase will handle all of the work of creating the database schema and migrating the data for you.


### PostgreSQL notes

-  Minimum version is PostgreSQL 9.4, since the code that handles these migrations uses a command that is only available in version 9.4 or newer.

## MySQL/MariaDB notes

- MySQL minimum recommended version is 5.7.7.
- MariaDB minimum recommended version is 10.2.2.
- And the following database settings are required, which is the default in the above recommended versions: `utf8mb4_unicode_ci` collation, `utf8mb4` character set, and `innodb_large_prefix=ON`.

### Troubleshooting

If you get stuck, check out [Error when loading application database from H2](../troubleshooting-guide/loading-from-h2.md).
