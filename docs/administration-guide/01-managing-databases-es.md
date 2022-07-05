***

## título: Agregar y administrar bases de datos

# Agregar y administrar bases de datos

*   [Agregar una conexión de base de datos](#adding-a-database-connection)
*   [Bases](#databases)
*   [Conexión a bases de datos alojadas por un proveedor de nube](#connecting-to-databases-hosted-by-a-cloud-provider)
*   [Opciones de conexión de base de datos](#database-connection-options)
*   [Volver a escanear una sola tabla o campo](#re-scanning-a-single-table-or-field)
*   [Eliminación de bases de datos](#deleting-databases)
*   [Solución de problemas](#troubleshooting)

## Agregar una conexión de base de datos

En la parte inferior de la barra lateral de navegación, haga clic en el botón **engranaje** y seleccione **Configuración de administración**.

Una vez en la sección Admin, seleccione el botón **Bases** desde la barra de navegación en la parte superior de la pantalla. Verá una lista de las bases de datos conectadas (si las hay). Para conectar una base de datos a la metabase, haga clic en **Agregar base de datos** y siga las instrucciones de conexión de la base de datos.

Aunque los detalles de la conexión difieren de una base de datos a otra, en general deberá obtener información de conexión del administrador de la base de datos, generalmente una combinación de nombre de host (a veces llamado punto final), puerto, nombre de usuario y contraseña de la base de datos, y el nombre de la base de datos.

## Bases

Metabase soporta muchas bases de datos y fuentes de datos diferentes, con diferentes niveles de soporte.

*   [Oficial](#officially-supported-databases) (esta página)
*   [Socio](../developers-guide-drivers.md)
*   [Comunidad](../developers-guide-drivers.md)

### Bases de datos con soporte oficial

Las siguientes bases de datos tienen controladores oficiales mantenidos por el equipo de Metabase. Clientes en [planes pagados](https://www.metabase.com/pricing/) obtendrá apoyo oficial.

*   [BigQuery](databases/bigquery.md) (Google Cloud Platform)
*   Druida
*   [Google Analytics](databases/google-analytics.md)
*   H2
*   [MongoDB (versión 3.6 o superior)](databases/mongodb.md) <!-- MongoDB supported version is from https://www.mongodb.com/support-policy -->
*   [MySQL (versión 5.7 o superior, así como MariaDB versión 10.2 o superior)](databases/mysql.md)
*   [Oráculo](databases/oracle.md)
*   [PostgreSQL](databases/postgresql.md)
*   Presto
*   Redshift (Amazon Web Services)
*   [Copo de nieve](databases/snowflake.md)
*   SparkSQL
*   SQL Server
*   SQLite
*   [Vertica](databases/vertica.md)

## Conexión a bases de datos alojadas por un proveedor de nube

Para obtener detalles de conexión específicos del proveedor, como conectarse a un almacén de datos de PostgreSQL en RDS:

*   [Servicio de base de datos relacional (RDS) de AWS](databases/aws-rds.md)

## Opciones de conexión de base de datos

Las opciones de conexión varían según la base de datos a la que se esté conectando. Aquí hay una descripción general:

*   [Usar una conexión segura (SSL)](#use-a-secure-connection-ssl)
*   [Usar un túnel SSH para las conexiones de base de datos](#use-an-ssh-tunnel-for-database-connections)
*   [Elegir cuándo se sincroniza y escanea la metabase](#choose-when-metabase-syncs-and-scans)
*   [Ejecute consultas automáticamente al realizar un filtrado y un resumen simples](#automatically-run-queries-when-doing-simple-filtering-and-summarizing)

### Usar una conexión segura (SSL)

Metabase intenta conectarse automáticamente a bases de datos con SSL primero, luego sin si eso no funciona. Si es posible conectarse a su base de datos con una conexión SSL, Metabase hará que esa sea la configuración predeterminada para su base de datos. Si prefiere conectarse sin esta capa de seguridad, siempre puede cambiar esta configuración más adelante, pero le recomendamos encarecidamente que mantenga SSL activado para mantener sus datos seguros.

### Usar un túnel SSH para las conexiones de base de datos

Vea nuestro [guía para la tunelización SSH](ssh-tunnel-for-database-connections.md).

### Elegir cuándo se sincroniza y escanea la metabase

De forma predeterminada, Metabase realiza una sincronización horaria ligera y un análisis diario intensivo de los valores de campo. Si tiene una base de datos grande, le recomendamos que habilite el interruptor **Elija cuándo se realizan las sincronizaciones y los escaneos** se encuentra al seleccionar **Mostrar opciones avanzadas**. Una vez activado, puede revisar cuándo y con qué frecuencia se realizan los escaneos de valor de campo. (Nota: esta configuración solía llamarse "Habilitar análisis en profundidad").

#### Sincronización de bases de datos

La metabase mantiene su propia información sobre las diversas tablas y campos de cada base de datos para ayudar en las consultas. De forma predeterminada, Metabase realiza esta sincronización ligera cada hora para buscar cambios en la base de datos, como nuevas tablas o campos. Metabase hace *no* copie cualquier dato de su base de datos. Sólo mantiene listas de las tablas y columnas.

La sincronización se puede configurar en horas o diariamente a una hora específica. La sincronización no se puede desactivar por completo, de lo contrario Metabase no funcionaría.

Si desea sincronizar su base de datos manualmente en cualquier momento, haga clic en ella en la lista Bases de datos en el panel de administración y haga clic en el botón **Sincronizar esquema de base de datos ahora** en el lado derecho de la pantalla:

![Database Manual Sync](images/DatabaseManualSync.png)

#### Búsqueda de valores de campo

Cuando Metabase se conecta por primera vez a su base de datos, echa un vistazo a los metadatos de las columnas de sus tablas y les asigna automáticamente un tipo. Metabase también toma una muestra de cada tabla para buscar URLs, JSON, cadenas codificadas, etc. Puede editar manualmente los metadatos de tabla y columna en la metabase en cualquier momento desde el **Modelo de datos** en la ficha **Panel de administración**.

De forma predeterminada, Metabase también realiza un muestreo diario más intensivo de los valores de cada campo y almacena en caché los valores distintos para que las casillas de verificación y los filtros de selección funcionen en paneles y preguntas SQL / nativas. Este proceso puede ralentizar las bases de datos grandes, por lo que si tiene una base de datos particularmente grande, puede activar la opción para elegir cuándo escanea la metabase y seleccionar una de las tres opciones de escaneo en la pestaña Programación:

![Scanning options](images/scanning-options.png)

*   **Regularmente, en un horario** le permite elegir escanear diariamente, semanalmente o mensualmente, y también le permite elegir a qué hora del día o qué día del mes escanear. Esta es la mejor opción si tiene una base de datos relativamente pequeña o si los valores distintos de las tablas cambian con frecuencia.
*   **Solo al agregar un nuevo widget de filtro** es una excelente opción si tiene una base de datos relativamente grande, pero aún desea habilitar el panel y los filtros de consulta SQL / nativos. Con esta opción habilitada, Metabase solo escaneará y almacenará en caché los valores del campo o campos que se requieran cada vez que se agregue un nuevo filtro a un panel o pregunta SQL/nativa. Por ejemplo, si tuviera que agregar un filtro de categoría de panel, asignado a un campo llamado `Customer ID` y otro llamado `ID`, solo esos dos campos se escanearían en el momento en que se guarde el filtro.
*   **Nunca, lo haré manualmente si lo necesito.** es una opción para bases de datos que son prohibitivamente grandes o que nunca tienen realmente nuevos valores agregados. Si desea activar un nuevo escaneo manual, haga clic en el botón en la parte superior derecha de la página de la base de datos que dice **Vuelva a escanear los valores de campo ahora.**

Si por alguna razón necesita eliminar los valores de campo almacenados en caché para su base de datos, haga clic en el botón que dice **Descartar valores de campo guardados** en la parte superior derecha de la página de la base de datos.

### Ejecute consultas automáticamente al realizar un filtrado y un resumen simples

De forma predeterminada, la metabase ejecutará automáticamente las consultas cuando utilice los botones Resumir y Filtrar al ver una tabla o un gráfico. Si los usuarios están explorando datos almacenados en una base de datos lenta, es posible que desee desactivar la ejecución automática para evitar volver a ejecutar la consulta cada vez que los usuarios cambien una opción en la vista Resumir. Puede desactivar esta opción en el cuadro **Mostrar opciones avanzadas** anule la selección de la opción alterna junto a **Vuelva a ejecutar consultas para exploraciones sencillas**. Al desactivar esto, los usuarios tienen la opción de volver a ejecutar la consulta cuando lo deseen.

### Tablas de refinopresión periódica

Si esta opción está habilitada, Metabase escaneará un subconjunto de valores de campos al sincronizar con esta base de datos para recopilar estadísticas que permitan cosas como un comportamiento de binning mejorado en los gráficos y, en general, para hacer que su instancia de Metabase sea más inteligente.

Puede activar y desactivar esta opción en el cuadro **Mostrar opciones avanzadas** sección.

### Opciones adicionales de cadena de conexión JDBC

Algunas bases de datos le permiten anexar opciones a la cadena de conexión que la metabase usará para conectarse a la base de datos.

## Volver a escanear una sola tabla o campo

Para volver a escanear una tabla específica, vaya a la sección Modelo de datos del Panel de administración, seleccione la tabla de la lista y haga clic en el icono de engranaje en la parte superior derecha de la página. Del mismo modo, para hacer esto solo para un campo específico, en la misma página del modelo de datos, busque el campo que desee y haga clic en el icono de engranaje en el extremo derecho del nombre y las opciones del campo.

En la página de configuración de tabla o de campo, verá estas opciones:

*   Vuelva a escanear esta tabla/campo
*   Descartar valores de campo almacenados en caché

![Re-scan options](images/re-scan-options.png)

Para obtener más información sobre la edición de metadatos, consulte [la página Modelo de datos: edición de metadatos](03-metadata-editing.md).

## Eliminación de bases de datos

**Precaución: ¡Eliminar una base de datos es irreversible! ¡Todas las preguntas guardadas y las tarjetas de tablero basadas en la base de datos también se eliminarán!**

Para eliminar una base de datos de metabase, haga clic en **Quitar esta base de datos** desde la pantalla de detalles de la base de datos.

![Database Manual Sync](images/DatabaseManualSync.png)

También puede eliminar una base de datos de la lista de bases de datos: sitúe el cursor sobre la fila con la base de datos que desea quitar y haga clic en el botón **Borrar** que aparece.

![deletedatabasebutton](images/DatabaseDeleteButton.png)

## Solución de problemas

Si tiene problemas con la conexión de la base de datos, puede consultar esto [guía de solución de problemas](https://www.metabase.com/docs/latest/troubleshooting-guide/datawarehouse.html), o visite [Foro de discusión de Metabase](https://discourse.metabase.com/) para ver si alguien ha encontrado y resuelto un problema similar.

## Lecturas adicionales

*   [Administración de bases de datos](https://www.metabase.com/docs/latest/administration-guide/01-managing-databases.html).
*   [Edición de metadatos](https://www.metabase.com/docs/latest/administration-guide/03-metadata-editing.html).
*   [Modelos](../users-guide/models.md).
*   [Configuración de permisos de acceso a datos](https://www.metabase.com/docs/latest/administration-guide/05-setting-permissions.html).

***

## Siguiente: habilitar funciones que envían correo electrónico

Metabase puede enviar correos electrónicos para ciertas funciones, como invitaciones por correo electrónico, pero primero debe [configurar una cuenta de correo electrónico](02-setting-up-email.md).
