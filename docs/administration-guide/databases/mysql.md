## Working with MySQL in Metabase

### Connecting to MySQL 8+ servers

Metabase uses the MariaDB connector to connect to MariaDB and MySQL servers. The MariaDB connector does not currently support MySQL 8's default authentication plugin, so in order to connect, you'll need to change the plugin used by the Metabase user to `mysql_native_password`: `ALTER USER 'metabase'@'%' IDENTIFIED WITH mysql_native_password BY 'thepassword';`

If you're still experiencing problems connecting, please refer to the [troubleshooting guide](../../troubleshooting-guide/datawarehouse.html#mysql-unable-to-log-in-with-correct-credentials).
