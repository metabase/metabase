***

## title: Protección de conexiones de base de datos mediante un certificado SSL

## Protección de conexiones de base de datos mediante un certificado SSL

Si desea conectar su Metabase Cloud o instancia autohospedada a una base de datos, puede proteger la conexión mediante el cifrado Secure Socket Layer (SSL) con un certificado.

Por qué querrías hacer esto:

*   Está utilizando Metabase Cloud y desea garantizar la identidad del almacén de datos al que se está conectando (por ejemplo, PostgreSQL, MySQL).
*   Está autohospedando Metabase y desea garantizar la identidad de un almacén de datos alojado por un proveedor externo. También puede usar este método para asegurarse de que está utilizando los parámetros de conexión más estrictos al conectarse a la base de datos de la aplicación.

Si está utilizando Metabase Cloud, la base de datos de la aplicación se maneja por usted, por lo que solo necesitaría proteger las conexiones a los almacenes de datos que agregue a su Metabase.

### Prerrequisitos

Una base de datos que permite una conexión JDBC, ya que deberá usar una cadena de conexión para especificar el certificado que desea usar.

### Paso 1: Descargue el certificado raíz de su proveedor

Si está ejecutando Metabase a través de un contenedor de Docker, ya debería tener los certificados para AWS y Azure.

Encontrará los certificados en el `/app/certs/` en la imagen docker de la metabase:

*   AWS RDS: `/app/certs/rds-combined-ca-bundle.pem`
*   Certificado de Azure: `/app/certs/DigiCertGlobalRootG2.crt.pem`

Si necesita un certificado diferente, puede crear su propia imagen de Docker. Visite la página de su proveedor externo para su base de datos y busque un enlace para descargar el certificado raíz para conectarse a su base de datos.

### Paso 2: Guarde el certificado en el directorio de la metabase

Guarde el certificado descargado en el mismo directorio donde guarda el archivo metabase.jar. Técnicamente, puede almacenar el certificado en cualquier lugar, pero mantenerlo en el mismo directorio que su metabase.jar archivo es una práctica recomendada. Especificará la ruta del certificado en la cadena de conexión.

### Paso 3: Agrega tu base de datos

Por ejemplo, supongamos que desea asegurar una conexión a una base de datos PostgreSQL. Siga las instrucciones de la aplicación para agregar la base de datos. Para obtener más información sobre cómo configurar una conexión de base de datos, consulte nuestros documentos para obtener información sobre [agregar una base de datos](01-managing-databases.md).

### Paso 4: Activa la opción "Usar una conexión segura (SSL)"

Si la base de datos admite una conexión JDBC, metabase le proporcionará un campo para introducir parámetros adicionales en la cadena de conexión. La metabase utilizará parámetros en la cadena de conexión para establecer una conexión segura.

### Paso 5: Agregar opciones de cadena de conexión adicionales

Deberá especificar la ubicación del certificado en el servidor que ejecuta Metabase.

Por ejemplo, al conectarse a una base de datos PostgreSQL, deberá agregar dos parámetros:

*   `sslmode`. Puedes ver la lista completa de opciones en [Documentación de PostgreSQL](https://jdbc.postgresql.org/documentation/head/ssl-client.html). Te recomendamos que utilices `verify-full`; es el más seguro, y la sobrecarga es mínima.
*   `sslrootcert`. Aquí especificará la ruta del archivo para el certificado.

Agregará un ampersand (`&`) para separar cada parámetro. Por ejemplo, En el **Agregar opciones de cadena de conexión adicionales** campo, agregarías algo como:

    sslmode=verify-full&sslrootcert=/path/to/certificate.pem

Reemplazar `/path/to/certifcate.pem` con la ruta completa del certificado que descargó de su proveedor.

Puede obtener más información sobre [Soporte SSL para PostgreSQL](https://www.postgresql.org/docs/current/libpq-ssl.html).

## Protección de la conexión a la base de datos de la aplicación mediante variables de entorno

Si está autohospedando Metabase, puede proteger la conexión a la base de datos de la aplicación mediante [variables de entorno](../operations-guide/environment-variables.md).

La variable de entorno que se va a utilizar es [`MB_DB_CONNECTION_URI`](../operations-guide/environment-variables.md#mb_db_connection_uri).

Deberá incluir la cadena de conexión completa aquí, incluido el host de base de datos, el puerto, el nombre de la base de datos y la información del usuario, así como los parámetros de conexión adicionales para incluir el certificado. Por ejemplo

    jdbc:postgresql://db.example.com:port/mydb?user=dbuser&password=dbpassword&ssl=true&sslmode=verify-full&sslrootcert=/path/to/certificate.pem

Ambos se pueden proporcionar para admitir escenarios de autenticación mutua.

## Almacenes de confianza y almacenes de claves

Con algunas bases de datos, como PostgreSQL y Oracle, puede proteger las conexiones mediante almacenes de confianza y almacenes de claves.

### Almacenes de confianza

Si se proporciona un almacén de confianza para verificar las credenciales, el cliente (la metabase) puede autenticar el servidor (la base de datos) y asegurarse de que su identidad es la esperada.

### Almacenes de claves

Si se utiliza un almacén de claves para proporcionar credenciales, el servidor (el servidor de base de datos) puede solicitar que el cliente (la metabase) se autentique mediante ese almacén de claves. Los almacenes de claves se usan con menos frecuencia y, en algunos casos, es imposible usar un almacén de claves (el RDS de Amazon prohíbe los almacenes de claves, por ejemplo). Pero es posible que desee usar un almacén de claves si está hospedando en las instalaciones.
