***

## título: Trabajar con Google BigQuery en Metabase

# Trabajar con Google BigQuery en la metabase

Esta página proporciona información sobre cómo crear y administrar una conexión a un Google [BigQuery](https://cloud.google.com/bigquery) conjunto de datos, incluido uno que utiliza [archivos almacenados en Google Drive](https://cloud.google.com/bigquery/external-data-drive) como fuente de datos, como Google Sheets (GSheets).

*   [Prerrequisitos](#prerequisites)
*   [Google Cloud Platform: crear una cuenta de servicio y un archivo JSON](#google-cloud-platform-creating-a-service-account-and-json-file)
*   [Metabase: Agregar un conjunto de datos de BigQuery](#metabase-adding-a-bigquery-dataset)
*   [Conexión de la metabase a las fuentes de datos de Google Drive](#connecting-metabase-to-google-drive-data-sources)
*   [Uso de SQL heredado](#using-legacy-sql)

## Prerrequisitos

Necesitarás tener un [Plataforma de Google Cloud](https://cloud.google.com/) cuenta con un [proyecto](https://cloud.google.com/storage/docs/projects) que desea utilizar en Metabase. Consulta la documentación de Google Cloud Platform para saber cómo [crear y administrar un proyecto](https://cloud.google.com/resource-manager/docs/creating-managing-projects). Este proyecto debe tener un conjunto de datos de BigQuery al que se pueda conectar la metabase.

## Google Cloud Platform: crear una cuenta de servicio y un archivo JSON

Primero necesitarás un [cuenta de servicio](https://cloud.google.com/iam/docs/service-accounts) JSON que metabase puede usar para acceder a su conjunto de datos de BigQuery. Las cuentas de servicio están destinadas a usuarios no humanos (como aplicaciones como Metabase) para autenticar (¿quién soy yo?) y autorizar (¿qué puedo hacer?) sus llamadas a la API.

Para crear el archivo JSON de la cuenta de servicio, sigue la documentación de Google en [configurar una cuenta de servicio](https://cloud.google.com/iam/docs/creating-managing-service-accounts) para su conjunto de datos de BigQuery. Aquí está el flujo básico:

1.  **Crear cuenta de servicio**. Desde la consola del proyecto de Google Cloud Platform, abre el menú de la barra lateral principal de la izquierda, ve al botón **IAM y Admin** y seleccione **Cuenta de servicio**. La consola enumerará las cuentas de servicio existentes, si las hubiera. En la parte superior de la pantalla, haga clic en **+ CREAR CUENTA DE SERVICIO**.

2.  **Rellene los detalles de la cuenta de servicio**. Asigne un nombre a la cuenta de servicio y agregue una descripción (el ID de la cuenta de servicio se rellenará una vez que agregue un nombre). A continuación, haga clic en el botón **Crear** botón.

3.  **Conceder a la cuenta de servicio acceso a este proyecto**. Tendrás que añadir **Papeles** a la cuenta de servicio para que la metabase tenga permiso para ver y ejecutar consultas en el conjunto de datos. Asegúrese de agregar los siguientes roles a la cuenta de servicio:

    *   Visor de datos de BigQuery
    *   Visor de metadatos de BigQuery
    *   Usuario de trabajo de BigQuery (distinto del usuario de BigQuery)

Para más información sobre **Papeles** en BigQuery, véase [Documentación de Google Cloud Platform](https://cloud.google.com/bigquery/docs/access-control).

4.  **Crear clave**. Una vez que haya asignado roles a la cuenta de servicio, haga clic en el botón **Crear clave** y seleccione **JSON** para el **tipo de clave**. El archivo JSON se descargará en su computadora.

> **Solo puede descargar la clave una vez**. Si elimina la clave, deberá crear otra cuenta de servicio con los mismos roles.

## Metabase: agregar un conjunto de datos de BigQuery

Una vez que haya creado y descargado el archivo JSON de su cuenta de servicio para su conjunto de datos de BigQuery, diríjase a su instancia de Metabase, haga clic en el botón **Configuración** y seleccione **Admin** para abrir el modo De administración. En **Bases** , haga clic en el botón **Agregar base de datos** en la parte superior derecha.

En el **AGREGAR BASE DE DATOS** página, seleccione **BigQuery** del **Tipo de base de datos** menú desplegable. Metabase le presentará los ajustes de configuración relevantes para completar:

### Configuración

#### Nombre para mostrar

**Nombre** es el título de la base de datos en Metabase.

#### ID del proyecto (anulación)

Cada conjunto de datos de BigQuery tendrá un **ID del proyecto**. Puede encontrar esta identificación a través del [Consola de Google Cloud](https://console.cloud.google.com/). Si no está seguro de dónde encontrar el **ID del proyecto**, consulte la documentación de Google en [obtener información sobre conjuntos de datos](https://cloud.google.com/bigquery/docs/dataset-metadata#getting_dataset_information).

> Al entrar en el **ID del proyecto**, omita el prefijo DE ID de proyecto. Por ejemplo, si su id es `project_name:project_id`, sólo introduzca `project_id`.

#### Archivo JSON de la cuenta de servicio

Cargue el archivo JSON de la cuenta de servicio que creó al seguir el [pasos anteriores](#google-cloud-platform-creating-a-service-account-and-json-file). El archivo JSON contiene las credenciales que la aplicación Metabase necesitará para leer y consultar el conjunto de datos, tal como se define en el **Papeles** ha agregado a la cuenta de servicio. Si necesita agregar adicionales **Papeles**, debe crear otra cuenta de servicio, descargar el archivo JSON y cargar el archivo en la metabase.

#### Datasets

Aquí puede especificar qué conjuntos de datos desea sincronizar y escanear. Las opciones son:

*   Todo
*   Sólo estos...
*   Todos excepto...

Para las opciones Sólo estos y Todos excepto, puede introducir una lista de valores separados por comas para indicar a la metabase qué conjuntos de datos desea incluir (o excluir). Por ejemplo:

    foo,bar,baz

Puede utilizar el `*` comodín para que coincida con varios conjuntos de datos.

Digamos que tiene tres conjuntos de datos: foo, bar y baz.

*   Si tiene **Sólo estos...** set, e introduzca la cadena `b*`, sincronizarás con bar y baz.
*   Si tiene **Todos excepto...** set, e introduzca la cadena `b*`, solo sincronizarás foo.

Tenga en cuenta que sólo el `*` se admite comodín; no puede usar otros caracteres especiales o regexes.

### Configuración avanzada

#### Usar la zona horaria de la máquina virtual Java (JVM)

*Valor predeterminado: Desactivado*

Le sugerimos que deje esto fuera de lugar a menos que esté haciendo la conversión manual de zonas horarias en muchas o la mayoría de sus consultas con estos datos.

#### Incluir ID de usuario y hash de consulta en las consultas

*Valor predeterminado: Activado*

Esto puede ser útil para la auditoría y la depuración, pero evita que BigQuery almacene en caché los resultados y puede aumentar sus costos.

#### Vuelva a ejecutar consultas para exploraciones sencillas

*Valor predeterminado: Activado*

Ejecutamos la consulta subyacente cuando explora datos mediante Resumir o Filtrar. Si el rendimiento es lento, puede intentar deshabilitar esta opción para ver si hay una mejora.

#### Elegir cuándo se sincroniza y escanea la metabase

*Valor predeterminado: Desactivado*

Metabase realiza una sincronización horaria ligera y un escaneo diario intensivo de los valores de campo. Si tiene una base de datos grande, le recomendamos que la active y revise cuándo y con qué frecuencia se realizan los análisis del valor del campo.

#### Tablas de refinopresión periódica

*Valor predeterminado: Desactivado*

Esto permite a Metabase buscar valores de campo adicionales durante las sincronizaciones, lo que permite un comportamiento más inteligente, como un agrupamiento automático mejorado en sus gráficos de barras.

#### Duración predeterminada de la caché de restablecimiento

{% include plans-blockquote.html feature="Almacenamiento en caché específico de la base de datos" %}

Cuánto tiempo para mantener los resultados de las preguntas. De forma predeterminada, la metabase utilizará el valor que proporcione en el [página de configuración de caché](../../administration-guide/14-caching.md), pero si esta base de datos tiene otros factores que influyen en la frescura de los datos, podría tener sentido establecer una duración personalizada. También puede elegir duraciones personalizadas en preguntas individuales o paneles para ayudar a mejorar el rendimiento.

Las opciones son:

*   **Usar instancia predeterminada (TTL)**. TTL es tiempo de vida, lo que significa cuánto tiempo permanece válida la memoria caché antes de que metabase vuelva a ejecutar la consulta.
*   **Costumbre**.

Si está en un plan de pago, también puede establecer la duración de la caché por preguntas. Ver [Controles avanzados de almacenamiento en caché](../../enterprise-guide/cache.md).

### Guardar la configuración de la base de datos

Cuando haya terminado, haga clic en el botón **Salvar** botón.

Dale a la metabase algo de tiempo para sincronizar con tu conjunto de datos de BigQuery, luego sal del modo de administración, haz clic en **Examinar datos**, busque su base de datos y comience a explorar sus datos.

## Conexión de la metabase a las fuentes de datos de Google Drive

Para conectarte a una fuente de datos almacenada en Google Drive (como una hoja de cálculo de Google), primero asegúrate de haber completado los pasos anteriores, como crear un proyecto en Google Cloud Platform, agregar un conjunto de datos de BigQuery y crear un [cuenta de servicio](#google-cloud-platform-creating-a-service-account-and-json-file). Entonces:

### Compartir tu fuente de Google Drive con la cuenta de servicio

Mientras ves tu archivo de Drive (por ejemplo, una hoja de cálculo de Google), haz clic en el botón **Compartir** en la parte superior derecha. En el cuadro de texto etiquetado **Agregar personas o grupos**, pegar en el correo electrónico de su cuenta de servicio, que puede encontrar en el [Página Cuentas de servicio](https://console.cloud.google.com/projectselector2/iam-admin/serviceaccounts?supportedpurview=project) en Google Cloud Console.

Esa dirección de correo electrónico se verá algo así como `service-account-name@your-project-name.iam.gserviceaccount.com`, con los nombres de su cuenta de servicio y proyecto completados en consecuencia.

Elegir **Espectador** en el menú desplegable, desmarque el icono **Notificar a las personas** y haga clic en **Compartir**.

### Crea una tabla externa en BigQuery que apunte a tu fuente de Google Drive

Si aún no tiene un conjunto de datos de BigQuery, [crear uno](https://cloud.google.com/bigquery/docs/datasets).

A continuación, utilizando Google Cloud Console, [Crear una tabla externa](https://cloud.google.com/bigquery/external-data-drive?hl=en#creating_and_querying_a_permanent_external_table) dentro de tu conjunto de datos de BigQuery que apunta a tu hoja de cálculo de Google.

Asegúrese de especificar el correcto **URI de unidad** y formato de archivo.

Si aún no lo has hecho [ha agregado el conjunto de datos de BigQuery a la metabase](#metabase-adding-a-bigquery-dataset), sigue adelante y hazlo ahora.

Una vez que haya completado estos pasos, podrá hacer preguntas y crear paneles en metabase utilizando una fuente de Google Drive como datos.

## Uso de SQL heredado

A partir de la versión 0.30.0, Metabase le dice a BigQuery que interprete las consultas SQL como [SQL estándar](https://cloud.google.com/bigquery/docs/reference/standard-sql/). Si prefieres usar [SQL heredado](https://cloud.google.com/bigquery/docs/reference/legacy-sql) en su lugar, puede indicar a Metabase que lo haga incluyendo un `#legacySQL` al principio de la consulta, por ejemplo:

```sql
#legacySQL
SELECT *
FROM [my_dataset.my_table]
```

## Solución de problemas

Si tienes problemas con tu conexión de BigQuery, puedes consultar esto [guía de solución de problemas](../../troubleshooting-guide/bigquery-drive) que cubre los problemas de BigQuery, [Esta](../../troubleshooting-guide/datawarehouse) en conexiones de almacenamiento de datos, o visite [Foro de discusión de Metabase](https://discourse.metabase.com/search?q=bigquery) para ver si alguien ha encontrado y resuelto un problema similar.

## Lecturas adicionales

*   [Administración de bases de datos](https://www.metabase.com/docs/latest/administration-guide/01-managing-databases.html)
*   [Edición de metadatos](https://www.metabase.com/docs/latest/administration-guide/03-metadata-editing.html)
*   [Modelos](../../users-guide/models.md)
*   [Configuración de permisos de acceso a datos](https://www.metabase.com/docs/latest/administration-guide/05-setting-permissions.html)
