***

## título: Conexión a una base de datos PostgreSQL

# Conexión a una base de datos PostgreSQL

Además de especificar el host, el puerto, el nombre de la base de datos y las credenciales de usuario para la conexión de la base de datos, tiene la opción de proteger esa conexión.

## Esquemas

Aquí puede especificar qué esquemas desea sincronizar y escanear. Las opciones son:

*   Todo
*   Sólo estos...
*   Todos excepto...

Para el **Sólo estos** y **Todos excepto** puede introducir una lista de valores separados por comas para indicar a la metabase qué esquemas desea incluir (o excluir). Por ejemplo:

    foo,bar,baz

Puede utilizar el `*` comodín para que coincida con varios esquemas.

Digamos que tienes tres esquemas: foo, bar y baz.

*   Si tiene **Sólo estos...** set, e introduzca la cadena `b*`, sincronizarás con bar y baz.
*   Si tiene **Todos excepto...** set, e introduzca la cadena `b*`, solo sincronizarás foo.

Tenga en cuenta que sólo el `*` se admite comodín; no puede usar otros caracteres especiales o regexes.

## Usar una conexión segura (SSL)

### Modo SSL

Las bases de datos PostgreSQL soportan diferentes niveles de seguridad con sus conexiones, con diferentes niveles de sobrecarga.

Las opciones del modo SSL incluyen:

*   conceder
*   preferir
*   requerir
*   verify-ca
*   verificar-completo

Consulte los documentos de PostgreSQL para obtener una tabla sobre los diferentes [Modos SSL][ssl-modes]y seleccione la opción que mejor se adapte a sus necesidades.

### Certificado raíz SSL (PEM)

Si establece el modo SSL en "verify-ca" o "verify-full", deberá especificar un certificado raíz (PEM). Tiene la opción de utilizar un **Ruta de acceso del archivo local** o un **Ruta del archivo cargado**. Si estás en Metabase Cloud, tendrás que seleccionar **Ruta del archivo cargado** y cargue su certificado.

### Autenticar certificado de cliente

#### Certificado de cliente SSL (PEM)

Tiene la opción de utilizar un **Ruta de acceso del archivo local** o un **Ruta del archivo cargado**. Si estás en Metabase Cloud, tendrás que seleccionar **Ruta del archivo cargado** y cargue su certificado.

#### CLAVE DE CLIENTE SSL (PKCS-8/DER o PKCS-12)

Una vez más, tiene la opción de usar un **Ruta de acceso del archivo local** o un **Ruta del archivo cargado**. Si estás en Metabase Cloud, tendrás que seleccionar **Ruta del archivo cargado** y cargue su certificado.

También deberá ingresar su **Contraseña de clave de cliente SSL**.

## Usar un túnel SSH

Puede configurar un túnel SSH proporcionando el host del túnel, el puerto, el nombre de usuario del túnel y las credenciales de autenticación SSH, ya sea mediante una clave SSH y una frase de contraseña, o una contraseña.

Para obtener más información, consulte [Túnel SSH en Metabase][ssh-tunnel].

## Credenciales predeterminadas de la aplicación Google Cloud Platform

Al correr en [Google Cloud SQL][gcp-cloud-sql] puede utilizar [Credenciales predeterminadas de la aplicación][gcp-adc] para conectarse de forma segura a su base de datos.

Para utilizar las credenciales predeterminadas de la aplicación, debe especificar las siguientes opciones adicionales de cadena de conexión JDBC:

*   socketFactory: el nombre de clase que se va a utilizar como SocketFactory al establecer una conexión de socket
    *   p. ej.. `socketFactory=com.google.cloud.sql.postgres.SocketFactory`
*   cloudSqlInstance: el nombre de la conexión de la instancia (que se encuentra en la página de detalles de la instancia)
    *   p. ej.. `cloudSqlInstance=my-project:us-central1:my-db`

Para obtener más información, consulte el [Documentación de Cloud SQL Connector for Java][gcp-cloud-sql-connector]

## Opciones avanzadas

### Opciones adicionales de cadena de conexión JDBC

Aquí puede agregar a su cadena de conexión.

### Vuelva a ejecutar consultas para una exploración sencilla

Ejecutamos la consulta subyacente cuando explora datos mediante Resumir o Filtrar. Esto está activado de forma predeterminada, pero puede desactivarlo si el rendimiento es lento.

### Elija cuándo se realizan las sincronizaciones y los escaneos

Este es un proceso ligero que comprueba si hay actualizaciones en el esquema de esta base de datos. En la mayoría de los casos, debería estar bien dejando que este conjunto se sincronice cada hora.

### Tablas de refinopresión periódica

Esto permite a Metabase buscar valores de campo adicionales durante las sincronizaciones, lo que permite un comportamiento más inteligente, como un agrupamiento automático mejorado en sus gráficos de barras.

## Nota sobre la sincronización de registros que incluyen JSON

Los campos JSON de Postgres no tienen esquema, por lo que la metabase no puede confiar en los metadatos de la tabla para definir qué claves tiene un campo JSON. Para evitar la falta de esquema, Metabase obtendrá los primeros diez mil registros y analizará el JSON en esos registros para inferir el "esquema" del JSON. La razón por la que Metabase se limita a diez mil registros es para que la sincronización de metadatos no ejerza una presión innecesaria sobre su base de datos.

El problema es que si las claves en el JSON varían de un registro a otro, es posible que las primeras diez mil filas no capturen todas las claves utilizadas por los objetos JSON en ese campo JSON. Para que Metabase infiera todas las claves JSON, deberá agregar las claves adicionales a los objetos JSON en la primera fila de diez mil.

[ssl-modes]: https://jdbc.postgresql.org/documentation/head/ssl-client.html

[ssh-tunnel]: ../ssh-tunnel-for-database-connections.html

[gcp-cloud-sql]: https://cloud.google.com/sql

[gcp-adc]: https://developers.google.com/identity/protocols/application-default-credentials

[gcp-cloud-sql-connector]: https://github.com/GoogleCloudPlatform/cloud-sql-jdbc-socket-factory/blob/main/docs/jdbc-postgres.md#creating-the-jdbc-url
