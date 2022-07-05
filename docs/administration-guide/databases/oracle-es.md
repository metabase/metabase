***

## título: Trabajar con Oracle en Metabase

# Trabajar con Oracle en Metabase

## Descarga del JAR del controlador JDBC de Oracle

Puede descargar un controlador JDBC desde [Página de descargas de controladores JDBC de Oracle](https://www.oracle.com/technetwork/database/application-development/jdbc/downloads/index.html).

La versión mínima del controlador debe ser 19c, independientemente de la versión de Java o la versión de Oracle Database que tenga.

Recomendamos utilizar el `ojdbc8.jar` KN3A

## Adición del JAR del controlador JDBC de Oracle al directorio de complementos de la metabase

En el directorio de la metabase (el directorio donde se guarda y ejecuta la metabase.jar), cree un directorio denominado `plugins` (si aún no existe.

Mueva el JAR que acaba de descargar (`ojdbc8.jar`) en el directorio de plugins y reinicie Metabase. La metabase hará que el controlador de Oracle esté disponible automáticamente cuando se inicie la copia de seguridad.

## Conexión con SSL

Para conectarse a Oracle a través de SSL y habilitar el cifrado, compruebe el botón `Use a secure connection (SSL)` en la página de configuración de la conexión. Puede agregar otras características SSL (incluida la autenticación de cliente y/o servidor) como se explica a continuación. Puedes
utilizar la autenticación de cliente y servidor (conocida como autenticación mutua).

### Autenticación de servidor con un almacén de confianza

Para configurar el cliente (Metabase) para autenticar la identidad del servidor (el servidor Oracle), es posible que deba
Configure un archivo truststore que incluya la CA raíz del servidor, de modo que la JVM que ejecuta metabase confíe en su
cadena de certificados. Consulte el
[Documentación de Oracle](https://docs.oracle.com/javase/8/docs/technotes/tools/unix/keytool.html) sobre el uso `keytool` para administrar archivos de claves y almacenes de confianza, importar certificados, etc.

Para obtener más información sobre la configuración de un almacén de confianza para instancias de Oracle de AWS RDS, consulte el
[instrucciones proporcionadas por Amazon](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.Oracle.Options.SSL.html#Appendix.Oracle.Options.SSL.JDBC).

Si necesita conectarse a otras bases de datos mediante SSL, en lugar de crear un nuevo almacén de confianza, es probable que desee agregar la CA de RDS a su archivo de almacén de confianza existente (probablemente llamado `cacerts`).

### Autenticación de cliente con un almacén de claves

Para configurar el servidor (el servidor Oracle) para autenticar la identidad del cliente (Metabase), debe
configurar un archivo de almacén de claves que incluya la clave privada del cliente. Importará la clave privada del cliente en el almacén de claves (en lugar de una CA raíz en un archivo de almacén de confianza). Agregue las siguientes opciones de JVM para metabase:

    -Djavax.net.ssl.keyStore=/path/to/keystore.jks
    -Djavax.net.ssl.keyStoreType=JKS \
    -Djavax.net.ssl.keyStorePassword=<keyStorePassword>

Una vez hecho esto, el servidor Oracle autenticará Metabase utilizando la clave privada cuando Metabase intente conectarse a través de SSL.

## Al correr desde un JAR

De forma predeterminada, el directorio de plugins se llama `plugins`, y vive en el mismo directorio que el JAR de la metabase.

Por ejemplo, si está ejecutando Metabase desde un directorio llamado `/app/`, debe mover el JAR del controlador JDBC de Oracle a `/app/plugins/`:

```bash
# example directory structure for running Metabase with Oracle support
/app/metabase.jar
/app/plugins/ojdbc8.jar
```

## Al ejecutar desde Docker

El proceso para agregar complementos cuando se ejecuta a través de Docker es similar, pero deberá montar el `plugins` directorio. Consulte las instrucciones [aquí](../../operations-guide/running-metabase-on-docker.html#adding-external-dependencies-or-plugins) para más detalles.
