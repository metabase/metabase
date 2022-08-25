---
title: MySQL
redirect_from:
  - /docs/latest/administration-guide/databases/mysql
---

# MySQL

- [Connecting to MySQL 8+ servers](#connecting-to-mysql-8-servers)
- [Unable to log in with correct credentials](#unable-to-log-in-with-correct-credentials)
- [Raising a MySQL Docker container of MySQL 8+](#raising-a-mysql-docker-container-of-mysql-8)
- [Note on syncing records that include JSON](#note-on-syncing-records-that-include-json)

## Connecting to MySQL 8+ servers

Metabase uses the MariaDB connector to connect to MariaDB and MySQL servers. The MariaDB connector does not currently support MySQL 8's default authentication plugin, so in order to connect, you'll need to change the plugin used by the Metabase user to `mysql_native_password`: `ALTER USER 'metabase'@'%' IDENTIFIED WITH mysql_native_password BY 'thepassword';`

## Unable to log in with correct credentials

**How to detect this:** Metabase fails to connect to your MySQL server with the error message "Looks like the username or password is incorrect", but you're sure that the username and password is correct. You may have created the MySQL user with an allowed host other than the host you're connecting from.

For example, if the MySQL server is running in a Docker container, and your `metabase` user was created with `CREATE USER 'metabase'@'localhost' IDENTIFIED BY 'thepassword';`, the `localhost` will be resolved to the Docker container, and not the host machine, causing access to be denied.

You can identify this issue by looking in the Metabase server logs for the error message `Access denied for user 'metabase'@'172.17.0.1' (using password: YES)`. Note the host name `172.17.0.1` (in this case a Docker network IP address), and `using password: YES` at the end.

You'll see the same error message when attempting to connect to the MySQL server with the command-line client: `mysql -h 127.0.0.1 -u metabase -p`.

**How to fix this:** Recreate the MySQL user with the correct host name: `CREATE USER 'metabase'@'172.17.0.1' IDENTIFIED BY 'thepassword';`. Otherwise, if necessary, a wildcard may be used for the host name: `CREATE USER 'metabase'@'%' IDENTIFIED BY 'thepassword';`

That user's permissions will need to be set:

```sql
GRANT SELECT ON targetdb.* TO 'metabase'@'172.17.0.1';
FLUSH PRIVILEGES;
```

Remember to drop the old user: `DROP USER 'metabase'@'localhost';`.

## Raising a MySQL Docker container of MySQL 8+

If you are spinning up a new MySQL container, and:

- you want Metabase to connect to the container without having to manually create the user or change the authentication mechanism,
- or you're facing a `RSA public key is not available client side (option serverRsaPublicKeyFile not set)` error,

Use the `['--default-authentication-plugin=mysql_native_password']` modifiers when you run the container, like so:

- a simple docker run: `docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=xxxxxx mysql:8.xx.xx --default-authentication-plugin=mysql_native_password`

- or in docker-compose:

```
mysql:
    image: mysql:8.xx.xx
    container_name: mysql
    hostname: mysql
    ports:
      - 3306:3306
    environment:
      - "MYSQL_ROOT_PASSWORD=xxxxxx"
      - "MYSQL_USER=metabase"
      - "MYSQL_PASSWORD=xxxxxx"
      - "MYSQL_DATABASE=metabase"
    volumes:
      - $PWD/mysql:/var/lib/mysql
    command: ['--default-authentication-plugin=mysql_native_password']
```

## Note on syncing records that include JSON

1. **Metabase will infer the JSON "schema" based on the keys in the first five hundred rows of a table.** MySQL JSON fields lack schema, so Metabase can't rely on table metadata to define which keys a JSON field has. To work around the lack of schema, Metabase will get the first five hundred records and parse the JSON in those records to infer the JSON's "schema". The reason Metabase limits itself to five hundred records is so that syncing metadata doesn't put unnecessary strain on your database.

The problem is that if the keys in the JSON vary record to record, the first five hundred rows may not capture all the keys used by JSON objects in that JSON field. To get Metabase to infer all the JSON keys, you'll need to add the additional keys to the JSON objects in the first five hundred rows.

2. **This JSON support doesn't work with MariaDB**, due to implementation differences between MySQL and MariaDB.

## Model caching

Metabase can create tables with model data in your database and refresh them on a schedule you define. Metabase's connection's credentials to that database must be able to read and write to the schema displayed in the info tooltip.

See [Models](../../data-modeling/models.md).
