## Working with MySQL in Metabase

### Connecting to MySQL 8+ servers

Metabase uses the MariaDB connector to connect to MariaDB and MySQL servers. The MariaDB connector does not currently support MySQL 8's default authentication plugin, so in order to connect, you'll need to change the plugin used by the Metabase user to `mysql_native_password`: `ALTER USER 'metabase'@'%' IDENTIFIED WITH mysql_native_password BY 'thepassword';`

If you're still experiencing problems connecting, please refer to the [troubleshooting guide](../../troubleshooting-guide/datawarehouse.html#mysql-unable-to-log-in-with-correct-credentials).

### Raising a MySQL Docker container of MySQL 8+

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