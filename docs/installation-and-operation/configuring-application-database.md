---
title: Configuring the Metabase application database
redirect_from:
  - /docs/latest/operations-guide/configuring-application-database
---

# Configuring the Metabase application database

The application database is where Metabase stores information about user accounts, questions, dashboards, and any other data needed to run the Metabase application.

For production, we recommend using PostgreSQL as your application database.

- [PostgreSQL](#postgresql) (recommended for production)
- [MySQL](#mysql-or-mariadb) (also works for production)
- [H2](#h2-default) (default - AVOID in production)

Metabase will read the connection configuration information when the application starts up. You can't change the application database while the application is running.

## PostgreSQL

We recommend that you use [PostgreSQL](https://www.postgresql.org/) for your Metabase application database.

You can change the application database to use Postgres using a few simple environment variables. For example, the following command tells Metabase to look for its application database using the supplied Postgres connection information.

```sh
export MB_DB_TYPE=postgres
export MB_DB_DBNAME=metabase
export MB_DB_PORT=5432
export MB_DB_USER=<username>
export MB_DB_PASS=<password>
export MB_DB_HOST=localhost
java -jar metabase.jar
```

Metabase will not create this database for you. Example command to create the database:

```sh
createdb --encoding=UTF8 -e metabase
```

If you have additional parameters, Metabase also supports providing a full JDBC connection string:

```sh
export MB_DB_CONNECTION_URI="jdbc:postgresql://localhost:5432/metabase?user=<username>&password=<password>"
java -jar metabase.jar
```

If you want to pass the connection URI, user, and password credentials separately from the JDBC connection string (useful if the password contains special characters), you can use the `MB_DB_CONNECTION_URI` [environment variable](../configuring-metabase/environment-variables.md) in combination with `MB_DB_USER` and `MB_DB_PASS` variables:

```sh
export MB_DB_CONNECTION_URI="jdbc:postgresql://localhost:5432/metabase"
export MB_DB_USER=<username>
export MB_DB_PASS=<password>
java -jar metabase.jar
```

## MySQL or MariaDB

We recommend [PostgreSQL](#postgresql), but you can also use [MySQL](https://www.mysql.com/) or [MariaDB](https://www.mariadb.org/).

The minimum recommended version is MySQL 8.0.17 or MariaDB 10.2.2, and the `utf8mb4` character set is required.


You can change the application database to use MySQL using environment variables like this:

```sh
export MB_DB_TYPE=mysql
export MB_DB_DBNAME=metabase
export MB_DB_PORT=3306
export MB_DB_USER=<username>
export MB_DB_PASS=<password>
export MB_DB_HOST=localhost
java -jar metabase.jar
```

Metabase won't create this database for you. Example SQL statement to create the database:

```sh
CREATE DATABASE metabase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

The following command will tell Metabase to look for its application database using the supplied MySQL connection information. Metabase also supports providing a full JDBC connection string if you have additional parameters:

```sh
export MB_DB_CONNECTION_URI="jdbc:mysql://localhost:3306/metabase?user=<username>&password=<password>"
java -jar metabase.jar
```

As with Postgres, `MB_DB_CONNECTION_URI` can also be used in combination with `MB_DB_USER` and/or `MB_DB_PASS` if you
want to pass one or both separately from the rest of the JDBC connection string:

    export MB_DB_CONNECTION_URI="jdbc:mysql://localhost:5432/metabase"
    export MB_DB_USER=<username>
    export MB_DB_PASS=<password>
    java -jar metabase.jar

## [H2](https://www.h2database.com/) (default)

> **For production installations of Metabase we recommend that people [replace the H2 database with PostgreSQL](./migrating-from-h2.md)**. Postgres offers a greater degree of performance and reliability when Metabase is running with many users.

By default, Metabase ships with an H2 database to make it easy to demo Metabase on your local machine. **Avoid using this default database in production**.

To use the H2 database for your Metabase,. When the application is first launched it will attempt to create a new H2 database in the same filesystem location the application is launched from.

You can see these database files from the terminal:

    ls metabase.*

You should see the following files:

    metabase.db.h2.db  # Or metabase.db.mv.db depending on when you first started using Metabase.
    metabase.db.trace.db

If for any reason you want to use an H2 database file in a separate location from where you launch Metabase you can do so using an environment variable. For example:

    export MB_DB_TYPE=h2
    export MB_DB_FILE=/the/path/to/my/h2.db
    java -jar metabase.jar

Note that H2 automatically appends `.mv.db` or `.h2.db` to the path you specify; do not include those in your path! In other words, `MB_DB_FILE` should be something like `/path/to/metabase.db`, rather than something like `/path/to/metabase.db.mv.db` (even though this is the file that actually gets created).

## Migrating from H2

If you've started out using the default, H2 database, but you want to preserve the content you've created and move to a production application database, Metabase provides limited support for [migrating from H2 to PostgreSQL](migrating-from-h2.md).

## Upgrading from a Metabase version pre-0.38

If you’re upgrading from a previous version of Metabase, note that for Metabase 0.38 we've removed the use of the PostgreSQL `NonValidatingFactory` for SSL validation. It’s possible that you could experience a failure either at startup (if you're using a PostgreSQL application database) or when querying a PostgreSQL data warehouse.

You can resolve this failure in one of two ways:

1. Configuring the PostgreSQL connection to use SSL certificate validation,
2. Or manually enabling the `NonValidatingFactory`. WARNING: this method is insecure. We're including it here only to assist in troubleshooting, or for situations in which security is not a priority.

How you configure your connection depends on whether you're using Postgres as Metabase's application database or as a data warehouse connected to Metabase:

**For Postgres application databases**:

To use SSL certificate validation, you'll need to use the `MB_DB_CONNECTION_URI` method to configure your database connection. Here's an example:

```
export MB_DB_CONNECTION_URI="postgres://localhost:5432/metabase?user=<username>&password=<password>&sslmode=verify-ca&sslrootcert=<path to CA root or intermediate root certificate>"
```

If you cannot enable certificate validation, you can enable the `NonValidatingFactory` for your application database via the same environment variable as above:

```
export MB_DB_CONNECTION_URI="postgres://localhost:5432/metabase?user=<username>&password=<password>&ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory"
```

**For Postgres data warehouse databases**

You can do the same inside the Metabase Admin page for the connection to your Postgres database. Add the following to the end of your JDBC connection string for your database:

```
&sslmode=verify-ca&sslrootcert=<path to CA root or intermediate root certificate>
```

If that does not work, you can enable `NonValidatingFactory` by adding the following to the end of your connection URI for your database:

```
&ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory
```

For more options to further tune the SSL connection parameters,
see the [PostgreSQL SSL client documentation](https://jdbc.postgresql.org/documentation/ssl/#configuring-the-client).
