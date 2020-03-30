# Migrating from using the H2 database to MySQL or Postgres

If you decide to use the default application database (H2) when you initially start using Metabase, but later decide that you'd like to switch to a more production-ready database such as MySQL or Postgres, we make the transition easy for you.

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
java -jar metabase.jar load-from-h2 /path/to/metabase.db # do not include .mv.db or .h2.db suffix
```

It is expected that you will run the command against a brand-new (empty!) database; Metabase will handle all of the work of creating the database schema and migrating the data for you.

#### Notes

- Avoid upgrading and migrating at the same time, since it can cause problems with one of database schemas not matching.
- It is required that you can connect to the target MySQL or Postgres database in whatever environment you are running this migration command in. So, if you are attempting to move the data to a cloud database, make sure you take that into consideration.
- For MySQL or MariaDB, the minimum recommended version is MySQL 5.7.7 and MariaDB 10.2.2, while `utf8mb4` character set is required and `innodb_large_prefix=ON`.
- The code that handles these migrations uses a Postgres SQL command that is only available in Postgres 9.4 or newer versions. Please make sure you Postgres database is version 9.4 or newer.
- H2 automatically adds a `.h2.db` or `.mv.db` extension to the database path you specify, so make sure the path to the DB file you pass to the command _does not_ include it. For example, if you have a file named `/path/to/metabase.db.h2.db`, call the command with `load-from-h2 /path/to/metabase.db`.
