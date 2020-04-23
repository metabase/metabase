# Configuring the Metabase Application Database

The application database is where Metabase stores information about users, saved questions, dashboards, and any other
data needed to run the application. The default settings use an embedded H2 database, but this is configurable.

##### Notes

- Using Metabase with an H2 application database is not recommended for production deployments. For production
  deployments, we highly recommend using Postgres, MySQL, or MariaDB instead. If you decide to continue to use H2,
  please be sure to back up the database file regularly.
- You cannot change the application database while the application is running. Connection configuration information is
  read only once when the application starts up and will remain constant throughout the running of the application.
- Metabase provides limited support for migrating from H2 to Postgres or MySQL if you decide to upgrade to a more
  production-ready database. See [Migrating from H2 to MySQL or Postgres](migrating-from-h2.md) for more details.

#### [H2](https://www.h2database.com/) (default)

**For production installations of Metabase we recommend that users [replace the H2 database with a more robust option](./migrating-from-h2.md) such as Postgres.** This offers a greater degree of performance and reliability when Metabase is running with many users.

To use the H2 database for your Metabase instance you don't need to do anything at all. When the application is first launched it will attempt to create a new H2 database in the same filesystem location the application is launched from.

You can see these database files from the terminal:

    ls metabase.*

You should see the following files:

    metabase.db.h2.db  # Or metabase.db.mv.db depending on when you first started using Metabase.
    metabase.db.trace.db

If for any reason you want to use an H2 database file in a separate location from where you launch Metabase you can do so using an environment variable. For example:

    export MB_DB_TYPE=h2
    export MB_DB_FILE=/the/path/to/my/h2.db
    java -jar metabase.jar

Note that H2 automatically appends `.mv.db` or `.h2.db` to the path you specify; do not include those in you path! In other words, `MB_DB_FILE` should be something like `/path/to/metabase.db`, rather than something like `/path/to/metabase.db.mv.db` (even though this is the file that actually gets created).

#### [Postgres](https://www.postgresql.org/)

You can change the application database to use Postgres using a few simple environment variables. For example:

    export MB_DB_TYPE=postgres
    export MB_DB_DBNAME=metabase
    export MB_DB_PORT=5432
    export MB_DB_USER=<username>
    export MB_DB_PASS=<password>
    export MB_DB_HOST=localhost
    java -jar metabase.jar

This will tell Metabase to look for its application database using the supplied Postgres connection information. Metabase also supports providing a full JDBC connection URI if you have additional parameters:

    export MB_DB_CONNECTION_URI="postgres://localhost:5432/metabase?user=<username>&password=<password>"
    java -jar metabase.jar

#### [MySQL](https://www.mysql.com/) or [MariaDB](https://www.mariadb.org/)

If you prefer to use MySQL or MariaDB we've got you covered. The minimum recommended version is MySQL 5.7.7 or MariaDB 10.2.2, and the `utf8mb4` character set is required. You can change the application database to use MySQL using environment variables like this:

    export MB_DB_TYPE=mysql
    export MB_DB_DBNAME=metabase
    export MB_DB_PORT=3306
    export MB_DB_USER=<username>
    export MB_DB_PASS=<password>
    export MB_DB_HOST=localhost
    java -jar metabase.jar

This will tell Metabase to look for its application database using the supplied MySQL connection information. Metabase also supports providing a full JDBC connection URI if you have additional parameters:

    export MB_DB_CONNECTION_URI="mysql://localhost:3306/metabase?user=<username>&password=<password>"
    java -jar metabase.jar
