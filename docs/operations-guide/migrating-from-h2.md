# Migrating from the default H2 database to a production database

- [Metabase's application database](#metabases-application-database)
- [Databases we recommend for a storing your Metabase application data](#databases-we-recommend-for-storing-your-metabase-application-data)
- [JAR: How to migrate from H2 to your production application database](#jar-how-to-migrate-from-h2-to-your-production-application-database)
- [Docker: how to migrate from H2 to your production application database](#docker-how-to-migrate-from-h2-to-your-production-application-database)
- [Troubleshooting migration issues](#troubleshooting-migration-issues)

## Metabase's application database

The difference between a local installation and a production installation of Metabase is the application database. The application database keeps track of all of your Metabase data: your questions, dashboards, collections, and so on.

Metabase ships with an embedded H2 application database that is not recommended for running Metabase in production. The reason Metabase ships with the H2 database is because we want people to spin up Metabase on their local machine and start playing around with asking questions.

If you want to run Metabase in production, you'll need to use a production-ready application database to store your application data. You can switch from using the default H2 application database at any time, but if you're planning on running Metabase in production, the sooner you migrate to a production application database, the better. If you keeping running Metabase with the default H2 application database, and you don't regularly back it up, the app db could get corrupted, and you could end up losing all of your questions, dashboards, collections, and other Metabase data.

You could also choose to run Metabase on a [Metabase Cloud](/pricing) plan, which takes care of all of this stuff for you.

## Choose a production database for storing your Metabase application data

- [PostgreSQL](https://www.postgresql.org/). Minimum version: 9.4.
- [MySQL](https://www.mysql.com/). Minimum version: 5.7.7. Required settings (which are the default): `utf8mb4_unicode_ci` collation, `utf8mb4` character set, and `innodb_large_prefix=ON`.
- [MariaDB](https://mariadb.org/). Minimum version: 10.2.2. Required settings (which are the default): `utf8mb4_unicode_ci` collation, `utf8mb4` character set, and `innodb_large_prefix=ON`.

Go with whichever database you're familiar with. If you're not familiar with any of these, or not sure which to pick, go with Postgres.

## JAR: How to migrate from H2 to your production application database

Metabase provides a custom migration command for migrating to a new application database. Here's what you'll do:

- [2. Shut down your Metabase instance](#2-shut-down-your-metabase-instance)
- [3. Back up your H2 application database](#3-back-up-your-h2-application-database)
- [4. Run the Metabase data migration command](#4-run-the-metabase-data-migration-command)

### 1. Confirm that you can connect to your target application database

You must be able to connect to the target Postgres or MySQL/MariaDB database in whatever environment you're running this migration command in. So, if you are attempting to move the data to a cloud database, make sure you can connect to that database.

### 2. Shut down your Metabase instance

You don't want people creating new stuff in your Metabase while you're migrating.

### 3. Back up your H2 application database

Safety first! See [Backing up Metabase Application Data](backing-up-metabase-application-data.md).

### 4. Run the Metabase data migration command

Run the migration command, `load-from-h2`, using the appropriate [environment variables](environment-variables.md) for the target database you want to migrate to.

You can find details about specifying MySQL and Postgres databases at [Configuring the application database](configuring-application-database.md).

Here's an example command for migrating to a Postgres database:

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

## Docker: how to migrate from H2 to your production application database

Metabase provides a custom migration command for migrating to a new application database. Here's what you'll do:

### 1. Confirm that you can connect to your target application database

You must be able to connect to the target Postgres or MySQL/MariaDB database in whatever environment you're running this migration command in. So, if you are attempting to move the data to a cloud database, make sure you can connect to that database.

### 2. Copy the H2 file out of the Docker container

We recommend running the migration outside of Docker. You'll need to copy the H2 file out of the Docker container before migrating. For example, if the container is called metabase, you'd run:

```
docker cp metabase:/metabase.db/metabase.db.mv.db ./
```

The above command would copy the database file to the directory you ran the command from.

### 3. Back up your H2 application database

Safety first! See [Backing up Metabase Application Data](backing-up-metabase-application-data.md).

### 4. Stop the existing Metabase container

You don't want people creating new stuff in your Metabase while you're migrating.

### 5. Run a new Metabase container to perform the migration

Run the migration command, `load-from-h2`, using the appropriate [environment variables](environment-variables.md) for the target database you want to migrate to.

You can find details about specifying MySQL and Postgres databases at [Configuring the application database](configuring-application-database.md).

Make sure you use the same version of Metabase you've been using. If you want to upgrade, do it after you've confirmed the migration is successful.

```
docker run --name metabase-migration \
    -v /path/metabase/data:/metabase-data \
    -e "MB_DB_FILE=/metabase-data/metabase.db" \
    -e "MB_DB_TYPE=postgres" \
    -e "MB_DB_DBNAME=metabase" \
    -e "MB_DB_PORT=5432" \
    -e "MB_DB_USER=<username>" \
    -e "MB_DB_PASS=<password>" \
    -e "MB_DB_HOST=my-database-host" \
     metabase/metabase load-from-h2
```

To further explain the example: in addition to specifying the target database connection details, set the `MB_DB_FILE` environment variable for the source H2 database location, and pass the argument `load-from-h2` to begin migrating.

## Troubleshooting migration issues

Check out [this troubleshooting guide](../troubleshooting-guide/loading-from-h2.md).
