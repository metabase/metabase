## Working with MySQL in Metabase

### Connecting to MySQL 8+ servers

Metabase uses the MariaDB connector to connect to MariaDB and MySQL servers. The MariaDB connector does not currently support MySQL 8's default authentication plugin, so in order to connect, you'll need to change the plugin used by the Metabase user to `mysql_native_password`: `ALTER USER 'metabase'@'%' IDENTIFIED WITH mysql_native_password BY 'thepassword';`

If you're still experiencing problems connecting, please refer to the [troubleshooting guide](../../troubleshooting-guide/datawarehouse.html#mysql-unable-to-log-in-with-correct-credentials).

### Raising a MySQL Docker container of MySQL 8+
If you are spinning up a new MySQL container and you want Metabase to connect to it without having to manually create the user or change the authentication mechanism, or you are facing the `RSA public key is not available client side (option serverRsaPublicKeyFile not set)` error, use the `['--sql_mode=', '--default-authentication-plugin=mysql_native_password']` modifiers when you are running the container. This will ensure that the root user and the user you create keep using the `mysql_native_password` authentication mechanism.
