---
title: Migrating to a production application database
redirect_from:
  - /docs/latest/operations-guide/migrating-from-h2
  - /docs/latest/operations-guide/running-migrations-manually
---

# Migrating to a production application database

This page covers how to convert a Metabase that's been using the built-in application database, H2, to a production-ready instance PostgreSQL. For more on why you should use Postgres as your app DB, check out [How to run Metabase in production](https://www.metabase.com/learn/administration/metabase-in-production).

If you'd rather move to Metabase Cloud, check out [Migrate to Metabase Cloud](https://www.metabase.com/docs/latest/cloud/migrate/guide).

## Metabase's application database

The main difference between a local installation and a production installation of Metabase is the application database. This application database keeps track of all of your Metabase data: your questions, dashboards, collections, and so on.

Metabase ships with an embedded H2 application database that you should avoid using in production. The reason Metabase ships with the H2 database is because we want people to spin up Metabase on their local machine and start playing around with asking questions.

If you want to run Metabase in production, you'll need to use a production-ready application database to store your application data. You can switch from using the default H2 application database at any time, but if you're planning on running Metabase in production, the sooner you migrate to a production application database, the better. If you keeping running Metabase with the default H2 application database, and you don't regularly back it up, the application database could get corrupted, and you could end up losing all of your questions, dashboards, collections, and other Metabase data.

The migration process is a one-off process. You can execute the migration script from any computer that has the H2 application database file.

### Avoid migrating and upgrading at the same time

One important thing here is that the version of Metabase you use during the migration process must be the same. Meaning, the Metabase you use to run the migration command must be the same one that was last used to create or update H2 file, which must be the same version you'll be using in production. Only _after_ completing the migration should you consider upgrading.

You could also choose to run Metabase on a [Metabase Cloud](https://www.metabase.com/pricing) plan, which takes care of all of this stuff for you. If you have an existing Metabase, here's how you can [migrate to Metabase Cloud](https://www.metabase.com/cloud/docs/migrate/guide.html).

## Supported databases for storing your Metabase application data

We recommend using PostgreSQL for your application database.

- [PostgreSQL](https://www.postgresql.org/). Minimum version: `12`. Postgres is our preferred choice for Metabase's application database.
- [MySQL](https://www.mysql.com/). Minimum version: `8.0.17`. Required settings (which are the default): `utf8mb4_unicode_ci` collation, `utf8mb4` character set, and `innodb_large_prefix=ON`.
- [MariaDB](https://mariadb.org/). Minimum version: `10.4.0`. Required settings (which are the default): `utf8mb4_unicode_ci` collation, `utf8mb4` character set, and `innodb_large_prefix=ON`.

## JAR: How to migrate from H2 to your production application database

> You must use the same version of Metabase throughout the migration process.

Metabase provides a custom migration command for migrating to a new application database. Here's what you'll do:

- [1. Confirm that you can connect to your target application database](#1-confirm-that-you-can-connect-to-your-target-application-database)
- [2. Shut down your Metabase instance](#2-shut-down-your-metabase-instance)
- [3. Back up your H2 application database](#3-back-up-your-h2-application-database)
- [4. Run the Metabase data migration command](#4-run-the-metabase-data-migration-command)
- [5. Start your Metabase](#5-start-your-metabase)

### 1. Confirm that you can connect to your target application database

You must be able to connect to the target application database in whatever environment you're running this migration command in. So, if you're attempting to move the data to a cloud database, make sure you can connect to that database.

### 2. Shut down your Metabase instance

You don't want people creating new stuff in your Metabase while you're migrating. Ideally, if you're running the Metabase JAR in production, you're [running Metabase as a service](./running-metabase-on-debian.md).

### 3. Back up your H2 application database

Safety first! See [Backing up Metabase Application Data](backing-up-metabase-application-data.md).

### 4. Run the Metabase data migration command

Run the migration command, `load-from-h2`, using the appropriate [environment variables](../configuring-metabase/environment-variables.md) for the target database you want to migrate to.

You can find details about specifying databases at [Configuring the application database](configuring-application-database.md).

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

Start your Metabase (with the db connection info, but without the `load-from-h2` and H2 file migration command), and you should be good to go. For example, if you're using Postgres, your command to start Metabase would look something like:

```
export MB_DB_TYPE=postgres
export MB_DB_CONNECTION_URI="jdbc:postgresql://<host>:5432/metabase?user=<username>&password=<password>"
java -jar metabase.jar
```

You should, however, keep your old H2 file just for safe-keeping, or as a heirloom, or talisman, or whatever.

## Docker: how to migrate from H2 to your production application database

> You must use the same version of Metabase throughout the migration process.

Metabase provides a custom migration command for migrating to a new application database. Here's what you'll do:

- [1. Confirm that you can connect to your target application database](#1-confirm-that-you-can-connect-to-your-target-application-database-1)
- [2. Back up your H2 application database](#2-back-up-your-h2-application-database)
- [3. Stop the existing Metabase container](#3-stop-the-existing-metabase-container)
- [3. Download the JAR](#3-download-the-jar)
- [4. Run the migration command](#4-run-the-migration-command)
- [5. Start a new Docker container that uses the new app db](#5-start-a-new-docker-container-that-uses-the-new-app-db)
- [7. Remove the old container that was using the H2 database](#7-remove-the-old-container-that-was-using-the-h2-database)

### 1. Confirm that you can connect to your target application database

You must be able to connect to the target application database in whatever environment you're running this migration command in. So, if you're attempting to move the data to a cloud database, make sure you can connect to that database.

### 2. Back up your H2 application database

Safety first! See [Backing up Metabase Application Data](backing-up-metabase-application-data.md).

If you don't back up your H2 database, and you replace or delete your container, you'll lose all of your questions, dashboards, and other Metabase data, so be sure to back up before you migrate.

### 3. Stop the existing Metabase container

You don't want people creating new stuff in your Metabase while you're migrating.

### 3. Download the JAR

In the directory where you saved your H2 file (that is, outside the container), [download the JAR](https://github.com/metabase/metabase/releases) for your current version.

Make sure you use the same version of Metabase you've been using. If you want to upgrade, perform the upgrade after you've confirmed the migration is successful.

### 4. Run the migration command

Create another copy of your H2 file that you extracted from the container when you backed up your app db (step 2).

From the directory with your H2 file and your Metabase JAR, run the migration command, `load-from-h2`. Use the appropriate connection string or [environment variables](../configuring-metabase/environment-variables.md) for the target database you want to migrate to. The command would look something like:

```
export MB_DB_TYPE=postgres
export MB_DB_CONNECTION_URI="jdbc:postgresql://<host>:5432/metabase?user=<username>&password=<password>"
java -jar metabase.jar load-from-h2 /path/to/metabase.db # do not include .mv.db
```

Metabase will start up, perform the migration (meaning, it'll take the data from the H2 file and put it into your new app db, in this a Postgres db), and then exit.

See [Configuring the application database](configuring-application-database.md).

### 5. Start a new Docker container that uses the new app db

With your new application database populated with your Metabase data, you can start a new container and tell the Metabase in the container to connect to the appdb. The command will looks something like this:

```
docker run -d -p 3000:3000 \
  -e "MB_DB_TYPE=postgres" \
  -e "MB_DB_DBNAME=<your-postgres-db-name>" \
  -e "MB_DB_PORT=5432" \
  -e "MB_DB_USER=<db-username>" \
  -e "MB_DB_PASS=<db-password>" \
  -e "MB_DB_HOST=<your-database-host>" \
  --name metabase metabase/metabase
```

### 7. Remove the old container that was using the H2 database

If you have your H2 file backed up somewhere safe, go ahead and remove the old container. See [Docker docs](https://docs.docker.com/engine/reference/commandline/rm/) for removing containers.

## Running Metabase application database migrations manually

When Metabase is starting up, it will typically attempt to determine if any changes are required to the application database, and, if so, will execute those changes automatically. If for some reason you wanted to see what these changes are and run them manually on your database then we let you do that.

Simply set the following environment variable before launching Metabase:

    export MB_DB_AUTOMIGRATE=false

When the application launches, if there are necessary database changes, you'll receive a message like the following which will indicate that the application cannot continue starting up until the specified upgrades are made:

    2015-12-01 12:45:45,805 [INFO ] metabase.db :: Database Upgrade Required

    NOTICE: Your database requires updates to work with this version of Metabase.  Please execute the following sql commands on your database before proceeding.

    -- *********************************************************************
    -- Update Database Script
    -- *********************************************************************
    -- Change Log: migrations/liquibase.yaml
    -- Ran at: 12/1/15 12:45 PM
    -- Against: @jdbc:h2:file:/Users/agilliland/workspace/metabase/metabase/metabase.db
    -- Liquibase version: 3.4.1
    -- *********************************************************************

    -- Create Database Lock Table
    CREATE TABLE PUBLIC.DATABASECHANGELOGLOCK (ID INT NOT NULL, LOCKED BOOLEAN NOT NULL, LOCKGRANTED TIMESTAMP, LOCKEDBY VARCHAR(255), CONSTRAINT PK_DATABASECHANGELOGLOCK PRIMARY KEY (ID));

    ...

    Once your database is updated try running the application again.

    2015-12-01 12:46:39,489 [INFO ] metabase.core :: Metabase Shutting Down ...

You can then take the supplied SQL script and apply it to your database manually. Once that's done just restart Metabase and everything should work normally.

## Troubleshooting migration issues

Check out [this troubleshooting guide](../troubleshooting-guide/loading-from-h2.md).
