# Migrating from the default H2 database to a production database

- [Metabase's application database](#metabases-application-database)
- [Supported databases for storing your Metabase application data](#supported-databases-for-storing-your-metabase-application-data)
- [JAR: How to migrate from H2 to your production application database](#jar-how-to-migrate-from-h2-to-your-production-application-database)
- [Docker: how to migrate from H2 to your production application database](#docker-how-to-migrate-from-h2-to-your-production-application-database)
- [Manual migrations](#manual-migrations)
- [Troubleshooting migration issues](#troubleshooting-migration-issues)

## Metabase's application database

The main difference between a local installation and a production installation of Metabase is the application database. The application database keeps track of all of your Metabase data: your questions, dashboards, collections, and so on. 

Metabase ships with an embedded H2 application database that you should avoid using in production. The reason Metabase ships with the H2 database is because we want people to spin up Metabase on their local machine and start playing around with asking questions.

If you want to run Metabase in production, you'll need to use a production-ready application database to store your application data. You can switch from using the default H2 application database at any time, but if you're planning on running Metabase in production, the sooner you migrate to a production application database, the better. If you keeping running Metabase with the default H2 application database, and you don't regularly back it up, the application database could get corrupted, and you could end up losing all of your questions, dashboards, collections, and other Metabase data.

The migration process is a one-off process. You can execute the migration script from any computer that has the H2 application database file. For example, if you're trying to migrate from the H2 database to a setup that uses AWS Elastic Beanstalk to run Metabase with an RDS database as the application database, you can run the migration from your computer instead of trying to cram the H2 file into your Elastic Beanstalk. 

### Avoid migrating and upgrading at the same time

One important thing here is that the version of Metabase you use during the migration process must be the same. Meaning, the Metabase you use to run the migration command must be the same one that was last used to create update H2 file, which must be the same version you'll be using in production. Only _after_ completing the migration should you consider upgrading.

You could also choose to run Metabase on a [Metabase Cloud](/pricing) plan, which takes care of all of this stuff for you. If you have an existing Metabase, here's how you can [migrate to Metabase Cloud](https://www.metabase.com/cloud/docs/migrate/guide.html).

## Supported databases for storing your Metabase application data

- [PostgreSQL](https://www.postgresql.org/). Minimum version: 9.4.
- [MySQL](https://www.mysql.com/). Minimum version: 5.7.7. Required settings (which are the default): `utf8mb4_unicode_ci` collation, `utf8mb4` character set, and `innodb_large_prefix=ON`.
- [MariaDB](https://mariadb.org/). Minimum version: 10.2.2. Required settings (which are the default): `utf8mb4_unicode_ci` collation, `utf8mb4` character set, and `innodb_large_prefix=ON`.

Go with whichever database you're familiar with. If you're not familiar with any of these, or not sure which to pick, go with Postgres.

## JAR: How to migrate from H2 to your production application database

> You must use the same version of Metabase throughout the migration process.

Metabase provides a custom migration command for migrating to a new application database. Here's what you'll do:

- [1. Confirm that you can connect to your target application database](#confirm-that-you-can-connect-to-your-target-application-database)
- [2. Shut down your Metabase instance](#2-shut-down-your-metabase-instance)
- [3. Back up your H2 application database](#3-back-up-your-h2-application-database)
- [4. Run the Metabase data migration command](#4-run-the-metabase-data-migration-command)
- [5. Start your Metabase](#5-start-your-metabase)

### 1. Confirm that you can connect to your target application database

You must be able to connect to the target Postgres or MySQL/MariaDB database in whatever environment you're running this migration command in. So, if you are attempting to move the data to a cloud database, make sure you can connect to that database.

### 2. Shut down your Metabase instance

You don't want people creating new stuff in your Metabase while you're migrating. Ideally, if you're running the Metabase JAR in production, you're [running Metabase as a service](./running-metabase-on-debian.md).

### 3. Back up your H2 application database

Safety first! See [Backing up Metabase Application Data](backing-up-metabase-application-data.md).

### 4. Run the Metabase data migration command

Run the migration command, `load-from-h2`, using the appropriate [environment variables](environment-variables.md) for the target database you want to migrate to.

You can find details about specifying MySQL and Postgres databases at [Configuring the application database](configuring-application-database.md).

Here's an example command for migrating to a Postgres database:

```
export MB_DB_TYPE=postgres
export MB_DB_CONNECTION_URI="jdbc:postgresql://<host>:5432/metabase?user=<username>&password=<password>"
java -jar metabase.jar load-from-h2 /path/to/metabase.db # do not include .mv.db
```

Here's an example command for migrating to a MySQL database using Java parameter instead of environment variables:

```
java -DMB_DB_TYPE=mysql -DMB_DB_CONNECTION_URI="jdbc:mysql://<host>:3306/metabase?user=<username>&password=<password>" -jar metabase.jar load-from-h2 metabase.db
```

Note that the file name of the database file itself might be `/path/to/metabase.db.mv.db`, but when running the `load-from-h2` command, you need to truncate the path to `/path/to/metabase.db`.

Metabase expects that you'll run the command against a brand-new (empty) database; it'll create the database schema and migrate the data for you.

### 5. Start your Metabase

Start your Metabase normally (without the `load-from-h2` command), and you should be good to go. You should, however, keep your old H2 file just for safe-keeping, or as a heirloom, or talisman, or whatever.

## Docker: how to migrate from H2 to your production application database

> You must use the same version of Metabase throughout the migration process.

Metabase provides a custom migration command for migrating to a new application database. Here's what you'll do:

- [1. Confirm that you can connect to your target application database](#1-confirm-that-you-can-connect-to-your-target-application-database)
- [3. Back up your H2 application database](#3-back-up-your-h2-application-database)
- [4. Stop the existing Metabase container](#4-stop-the-existing-metabase-container)
- [5. Run a new Metabase container to perform the migration](#5-run-a-new-metabase-container-to-perform-the-migration)

### 1. Confirm that you can connect to your target application database

You must be able to connect to the target Postgres or MySQL/MariaDB database in whatever environment you're running this migration command in. So, if you're attempting to move the data to a cloud database, make sure you can connect to that database.

### 2. Back up your H2 application database

Safety first! See [Backing up Metabase Application Data](backing-up-metabase-application-data.md). 

If you don't back up your H2 database, and you replace or delete your container, you'll lose all of your questions, dashboards, and other Metabase data, so be sure to back up before you migrate. So don't skip this step.

### 4. Stop the existing Metabase container

You don't want people creating new stuff in your Metabase while you're migrating.

### 5. Run a new Metabase container to perform the migration

Run the migration command, `load-from-h2`, using the appropriate [environment variables](environment-variables.md) for the target database you want to migrate to.

You can find details about specifying MySQL and Postgres databases at [Configuring the application database](configuring-application-database.md).

Make sure you use the same version of Metabase you've been using. If you want to upgrade, do it after you've confirmed the migration is successful.

TODO update this.

```
docker run --name metabase-migration \
    -e "MB_DB_FILE=/metabase.db" \
    -e "MB_DB_TYPE=postgres" \
    -e "MB_DB_DBNAME=metabase" \
    -e "MB_DB_PORT=5432" \
    -e "MB_DB_USER=username" \
    -e "MB_DB_PASS=password" \
    -e "MB_DB_HOST=my-database-host" \
     metabase/metabase load-from-h2
```

To further explain the example: in addition to specifying the target database connection details, set the `MB_DB_FILE` environment variable for the source H2 database location, and pass the argument `load-from-h2` to begin migrating.

### 6. Start a new Docker container that uses the new app db

### 7. Remove the old container that was using the H2 database

## Manual migrations

See [Running Metabase database migrations manually](running-migrations-manually.md).

## Troubleshooting migration issues

Check out [this troubleshooting guide](../troubleshooting-guide/loading-from-h2.md).
