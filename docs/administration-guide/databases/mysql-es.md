***

## título: Trabajar con MySQL en Metabase

# Trabajar con MySQL en metabase

Esta página incluye información útil para conectar Metabase a su base de datos MySQL.

*   [Conexión a servidores MySQL 8+](#connecting-to-mysql-8-servers)
*   [No se puede iniciar sesión con las credenciales correctas](#unable-to-log-in-with-correct-credentials)
*   [Creación de un contenedor MySQL Docker de MySQL 8+](#raising-a-mysql-docker-container-of-mysql-8)

## Conexión a servidores MySQL 8+

La metabase utiliza el conector MariaDB para conectarse a los servidores MariaDB y MySQL. El conector MariaDB actualmente no es compatible con el complemento de autenticación predeterminado de MySQL 8, por lo que para conectarse, deberá cambiar el complemento utilizado por el usuario de la metabase a `mysql_native_password`: `ALTER USER 'metabase'@'%' IDENTIFIED WITH mysql_native_password BY 'thepassword';`

## No se puede iniciar sesión con las credenciales correctas

**Cómo detectar esto:** La metabase no se conecta a su servidor MySQL con el mensaje de error "Parece que el nombre de usuario o la contraseña son incorrectos", pero está seguro de que el nombre de usuario y la contraseña son correctos. Es posible que haya creado el usuario de MySQL con un host permitido que no sea el host desde el que se está conectando.

Por ejemplo, si el servidor MySQL se ejecuta en un contenedor de Docker, y su `metabase` El usuario se creó con `CREATE USER 'metabase'@'localhost' IDENTIFIED BY 'thepassword';`el `localhost` se resolverá en el contenedor de Docker, y no en el equipo host, lo que provocará la denegación de acceso.

Puede identificar este problema buscando el mensaje de error en los registros del servidor de metabase `Access denied for user 'metabase'@'172.17.0.1' (using password: YES)`. Anote el nombre de host `172.17.0.1` (en este caso una dirección IP de red de Docker), y `using password: YES` al final.

Verá el mismo mensaje de error al intentar conectarse al servidor MySQL con el cliente de línea de comandos: `mysql -h 127.0.0.1 -u metabase -p`.

**Cómo solucionar esto:** Vuelva a crear el usuario de MySQL con el nombre de host correcto: `CREATE USER 'metabase'@'172.17.0.1' IDENTIFIED BY 'thepassword';`. De lo contrario, si es necesario, se puede usar un comodín para el nombre de host: `CREATE USER 'metabase'@'%' IDENTIFIED BY 'thepassword';`

Los permisos de ese usuario deberán establecerse:

```sql
GRANT SELECT ON targetdb.* TO 'metabase'@'172.17.0.1';
FLUSH PRIVILEGES;
```

Recuerde eliminar al usuario anterior: `DROP USER 'metabase'@'localhost';`.

## Creación de un contenedor MySQL Docker de MySQL 8+

Si está activando un nuevo contenedor mySQL y:

*   desea que Metabase se conecte al contenedor sin tener que crear manualmente el usuario o cambiar el mecanismo de autenticación,
*   o te enfrentas a un `RSA public key is not available client side (option serverRsaPublicKeyFile not set)` error

Utilice el botón `['--default-authentication-plugin=mysql_native_password']` modificadores al ejecutar el contenedor, así:

*   una simple ejecución de docker: `docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=xxxxxx mysql:8.xx.xx --default-authentication-plugin=mysql_native_password`

*   o en docker-compose:

<!---->

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
