***

## título: Trabajar con MongoDB en Metabase

# Trabajar con MongoDB en metabase

Este artículo cubre:

*   [Conexión a MongoDB](#connecting-to-mongodb).
*   [Configuración de SSL a través de la línea de comandos](#configuring-ssl-via-the-command-line).
*   [Conexión a un clúster de MongoDB Atlas](#connecting-to-a-mongodb-atlas-cluster).
*   [Problemas generales de conectividad](#general-connectivity-concerns).
*   [Agregué campos a mi base de datos pero no los veo en Metabase](#i-added-fields-to-my-database-but-dont-see-them-in-metabase).

## Cómo sincroniza la metabase los datos en MongoDB

Debido a que MongoDB contiene datos no estructurados, Metabase adopta un enfoque diferente para sincronizar los metadatos de su base de datos. Para tener una idea del esquema, Metabase escaneará los primeros diez mil documentos de cada colección en su MongoDB. Este muestreo ayuda a metabase a hacer cosas como diferenciar los campos de fecha y hora de los campos de cadena y proporcionar a las personas filtros rellenados previamente. La razón por la que Metabase solo escanea una muestra de los documentos es porque escanear cada documento en cada colección en cada sincronización pondría demasiada presión en su base de datos. Y aunque el muestreo hace un buen trabajo manteniendo la Metabase actualizada, también puede significar que los nuevos campos a veces pueden caer por las grietas, lo que lleva a problemas de visualización, o incluso los campos no aparecen en sus resultados. Para obtener más información, consulte nuestro [guía de solución de problemas](../../troubleshooting-guide/datawarehouse.md).

## Conexión a MongoDB

Vaya a Admin -> Bases de datos y haga clic en el botón **Agregar base de datos** botón. Seleccione MongoDB en el menú desplegable e ingrese su deseo **Nombre para mostrar** para esta base de datos.

Hay dos formas de conectarse a MongoDB:

1.  Uso del [Campos de metabase para introducir los detalles de la conexión](#using-metabase-fields).
2.  Pegando tu [cadena de conexión](#using-a-connection-string).

### Uso de campos de metabase

La forma predeterminada de conectarse a MongoDB es completar los detalles de su conexión en los campos que proporciona la metabase:

*   Anfitrión
*   Nombre de la base de datos
*   Puerto
*   Nombre de usuario
*   Contraseña
*   Base de datos de autenticación (opcional)
*   Opciones de cadena de conexión adicionales (opcional)

También tendrás la opción de **Usar una conexión segura (SSL)**. Habilite SSL y pegue el contenido de la cadena de certificados SSL del servidor en el cuadro de texto de entrada. Esta opción solo está disponible para este método de conexión (es decir, no puede incluir un certificado al conectarse con una cadena de conexión).

#### Configuración avanzada para la conexión directa

*   **Usar DNS SRV al conectarse** El uso de esta opción requiere que el host proporcionado sea un FQDN. Si se conecta a un clúster de Atlas, es posible que deba habilitar esta opción. Si no sabe lo que esto significa, deje esto deshabilitado.

### Uso de una cadena de conexión

Si prefiere conectarse a MongoDB mediante un [cadena de conexión](https://docs.mongodb.com/manual/reference/connection-string/), haga clic en **Pegar una cadena de conexión**. La interfaz de usuario de la metabase se actualizará con un campo para pegar la cadena de conexión.

Actualmente, la metabase NO admite los siguientes parámetros de cadena de conexión:

*   `tlsCertificateKeyFile`
*   `tlsCertificateKeyFilePassword`
*   `tlsCAFile`

Si necesita utilizar un certificado, conéctese a través del [método predeterminado](#using-metabase-fields) y habilitar **Usar una conexión segura (SSL)**.

### Configuración común a ambas opciones de conexión

*   **Usar un túnel SSH**: Solo se puede acceder a algunas instalaciones de bases de datos conectándose a través de un host bastión SSH. Esta opción también proporciona una capa adicional de seguridad cuando una VPN no está disponible. Habilitar esto suele ser más lento que una conexión directa.
*   **Vuelva a ejecutar consultas para una exploración sencilla**: Cuando esto está activado, metabase ejecutará automáticamente consultas cuando los usuarios realicen exploraciones simples con los botones Resumir y Filtrar al ver una tabla o gráfico. Puede desactivar esto si la consulta de esta base de datos es lenta. Esta configuración no afecta a los detalles ni a las consultas SQL.
*   **Elija cuándo se realizan las sincronizaciones y los escaneos**: De forma predeterminada, Metabase realiza una sincronización horaria ligera y un análisis diario intensivo de los valores de campo. Si tiene una base de datos grande, le recomendamos que la active y revise cuándo y con qué frecuencia se realizan los análisis del valor del campo.
*   **Tablas de refinopresión periódica**: Esta configuración, deshabilitada de forma predeterminada, permite a metabase buscar valores de campo adicionales durante las sincronizaciones, lo que permite un comportamiento más inteligente, como un agrupamiento automático mejorado en los gráficos de barras.

## Configuración de SSL a través de la línea de comandos

Puede introducir un certificado autofirmado a través de la interfaz de usuario de la metabase (aunque no cuando se utiliza una cadena de conexión), o puede utilizar la línea de comandos para agregar un certificado autofirmado.

    cp /usr/lib/jvm/default-jvm/jre/lib/security/cacerts ./cacerts.jks
    keytool -import -alias cacert -storepass changeit -keystore cacerts.jks -file my-cert.pem

A continuación, inicie Metabase utilizando la tienda:

    java -Djavax.net.ssl.trustStore=cacerts.jks -Djavax.net.ssl.trustStorePassword=changeit -jar metabase.jar

Más información sobre [configurar SSL con MongoDB](http://mongodb.github.io/mongo-java-driver/3.0/driver/reference/connecting/ssl/).

## Conexión a un clúster de MongoDB Atlas

Para asegurarse de que está utilizando la configuración de conexión correcta:

1.  Inicie sesión en su [Grupo Atlas](https://cloud.mongodb.com)

2.  Seleccione el clúster al que desea conectarse y haga clic en **Conectar**.

    ![Your cluster screengrab](../images/mongo\_1.png "Your cluster")

3.  Clic **Conecte su aplicación**.

    ![Connect screengrab](../images/mongo\_2.png "Connect")

4.  Escoger **Java** y **3.6 o posterior**.

    ![Java screengrab](../images/mongo\_3.png "Java")

5.  La cadena de conexión resultante tiene la información relevante para proporcionar a la metabase `Add a Database` formulario para MongoDB.

6.  Es probable que desee seleccionar la opción `Use DNS SRV`, que los clústeres Atlas más recientes utilizan de forma predeterminada.

## Problemas generales de conectividad

*   **Conéctese usando `DNS SRV`**, que es el método recomendado para los clústeres Atlas más recientes.
*   **¿Ha comprobado la lista blanca de hosts de clúster?** Al probar una conexión pero ver un error, ¿ha intentado establecer la lista blanca de IP en `0.0.0.0/0`? La inclusión en la lista blanca de esta dirección permite conexiones desde cualquier dirección IP. Si conoce la(s) dirección(es) IP(es) o el bloque CIDR de clientes, úselo en su lugar.
*   **Conectarse al servidor secundario**. Cuando se conecte a un clúster, utilice siempre el botón `?readPreference=secondary` en la cadena de conexión, que permite a la metabase leer desde un servidor secundario en lugar de consumir recursos del servidor principal.

## Agregué campos a mi base de datos pero no los veo en Metabase

Es posible que la metabase no sincronice todos los campos, ya que solo escanea los primeros 200 documentos de una colección para obtener una muestra de los campos que contiene la colección. Dado que cualquier documento en una colección MongoDB puede contener cualquier número de campos, la única forma de obtener una cobertura del 100% de todos los campos sería escanear cada documento en cada colección, lo que pondría demasiada presión en su base de datos (por lo que no hacemos eso).

Una solución consiste en incluir todas las claves posibles en el primer documento de la colección y asignar a esas claves valores nulos. De esa manera, Metabase podrá reconocer el esquema correcto para toda la colección.

## Lecturas adicionales

Consulte nuestra guía de solución de problemas para obtener información sobre [solucionar problemas de conexión](../../troubleshooting-guide/datawarehouse.md).
