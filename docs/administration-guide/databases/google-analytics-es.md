***

## título: Trabajar con Google Analytics en Metabase

# Trabajar con Google Analytics en la metabase

Esta página proporciona información sobre cómo crear y administrar una conexión a un [Google Analytics][google-analytics] conjunto de datos.

La configuración de Google Analytics requerirá que configure:

1.  Un [Cuenta de Google Cloud Platform (GCP)](#prerequisites).
2.  El [Consola de Google Cloud Platform (GCP)](#google-cloud-platform-creating-a-service-account-and-json-file).
3.  Usted [Configuración de administración de la metabase](#metabase-adding-a-google-analytics-dataset).

Una vez que haya configurado Google Analytics en ambos lugares, puede [Compruebe si la configuración de Google Analytics funciona correctamente](#checking-if-google-analytics-is-working-correctly).

## Prerrequisitos

Necesitará tener un [Google Cloud Platform (GCP)][google-cloud] y cree el [proyecto][google-cloud-create-project] que desea utilizar en Metabase. Consulta la documentación de Google Cloud Platform sobre cómo [crear y administrar un proyecto][google-cloud-management] si no tiene uno.

## Google Cloud Platform: crear una cuenta de servicio y un archivo JSON

Primero necesitarás un [cuenta de servicio][google-service-accounts] Archivo JSON que la Metabase puede
utilizar para acceder a su conjunto de datos de Google Analytics. Las cuentas de servicio están destinadas a usuarios no humanos (como aplicaciones)
como Metabase) para autenticar (¿quién soy yo?) y autorizar (¿qué puedo hacer?) sus llamadas a la API.

Para crear el archivo JSON de la cuenta de servicio, sigue la documentación de Google en [configurar cuentas de servicio][google-managing-service-accounts] para su conjunto de datos de Google Analytics.

1.  De su [Consola de Google Cloud Platform][google-cloud-platform-console]Vete a **IAM y Admin** > **Cuentas de servicio**.

2.  Clic **+ CREAR CUENTA DE SERVICIO** y complete los detalles de su cuenta de servicio.
    *   Asigne un nombre a la cuenta de servicio.
    *   Agregue una descripción (el ID de la cuenta de servicio se rellenará una vez que agregue un nombre).

3.  Clic **Continuar** para omitir las secciones opcionales.

4.  Clic **Hecho** para crear su cuenta de servicio.

5.  Del **...** menú, ir a **Administrar claves** > **Agregar clave**.
    *   Escoger **JSON** para el **tipo de clave**.
    *   Clic **Crear** para descargar el archivo JSON en el equipo. **Solo puede descargar la clave una vez**.
    *   Si elimina la clave, deberá crear otra cuenta de servicio con los mismos roles.

6.  [**Agregar la cuenta de servicio**][google-analytics-add-user] a su cuenta de Google Analytics.

    *   Busque el correo electrónico de la cuenta de servicio haciendo clic en el nombre de su cuenta de servicio desde **IAM y Admin** > **Cuentas de servicio**.
    *   Al correo electrónico de la cuenta de servicio le gustará:
            my_service_account_name@my_project_id.iam.gserviceaccount.com
    *   Solo se necesitan permisos de lectura y análisis para la metabase.

7.  Habilite la API de Google Analytics desde el [Descripción general de la API][google-api-overview].
    *   Comprueba que estás en el proyecto correcto antes de hacer clic en **Habilitar**.
    *   Para obtener más documentación, consulte [Habilitar y deshabilitar las API][google-enable-disable-apis].

## Metabase: agregar un conjunto de datos de Google Analytics

En tu Metabase, haz clic en **Configuración** y seleccione "Admin" para abrir el **Panel de administración**. En **Bases** , haga clic en el botón **Agregar base de datos** , luego seleccione "Google Analytics" en el menú desplegable "Tipo de base de datos" y complete los ajustes de configuración:

### Configuración

#### Nombre para mostrar

**Nombre** es el título de la base de datos en Metabase.

#### ID de cuenta

Para obtener el **ID de cuenta de Google Analytics**Vete a [Google Analytics][google-analytics] y haga clic en el botón **Admin** rueda dentada. En
la pestaña de administración, vaya a la casilla **Configuración de la cuenta** : encontrará el ID de cuenta debajo de la "Configuración básica"
encabezado.

#### Archivo JSON de la cuenta de servicio

Cargue el archivo JSON de la cuenta de servicio que creó al seguir los pasos anteriores. El archivo JSON contiene el
credenciales que la aplicación Metabase necesitará para leer y consultar el conjunto de datos.

### Configuración avanzada

*   **Vuelva a ejecutar consultas para exploraciones sencillas**: Cuando esta configuración está habilitada (que es de forma predeterminada), Metabase ejecuta automáticamente consultas cuando los usuarios realizan exploraciones sencillas con los botones Resumir y Filtrar al ver una tabla o gráfico. Puede desactivar esto si encuentra que el rendimiento es lento. Esta configuración no afecta a los detalles ni a las consultas SQL.

*   **Elija cuándo se realizan las sincronizaciones y los escaneos**: Cuando esta configuración está deshabilitada (que es de forma predeterminada), metabase comprueba regularmente la base de datos para actualizar sus metadatos internos. Si tiene una base de datos grande, podemos activarla y controlar cuándo y con qué frecuencia se realizan los escaneos de valores de campo.

*   **Tablas de refinopresión periódica**: Esta configuración, deshabilitada de forma predeterminada, permite a metabase buscar valores de campo adicionales durante las sincronizaciones, lo que permite un comportamiento más inteligente, como un agrupamiento automático mejorado en los gráficos de barras.

Por favor, vea el [documentación de análisis y sincronización de bases de datos][sync-docs] para obtener más detalles sobre estos ajustes de alternancia.

## Guardar la configuración de la base de datos

Cuando haya terminado, haga clic en el botón **Salvar** botón. Un cuadro de diálogo modal le informará de que se ha agregado su base de datos. Puede hacer clic en **Explore estos datos** para ver algunas exploraciones automáticas de sus datos, o haga clic en **Estoy bien gracias** para permanecer en el **Panel de administración**.

## Comprobar si Google Analytics funciona correctamente

Dar metabase [algún tiempo para sincronizar][sync-docs] con el conjunto de datos de Google Analytics y, a continuación, salga del **Panel de administración**, haga clic en **Examinar datos**, busque su base de datos de Google Analytics y comience a explorar. Una vez que metabase haya terminado de sincronizarse, verá los nombres de sus propiedades y aplicaciones en el navegador de datos.

Si tienes problemas, consulta las guías en [Solución de problemas de orígenes de datos][troubleshooting-data-sources].

[google-analytics]: https://cloud.google.com/analytics

[google-analytics-add-user]: https://support.google.com/analytics/answer/1009702

[google-api-overview]: https://console.cloud.google.com/apis/api/analytics.googleapis.com/overview

[google-cloud]: https://cloud.google.com/

[google-cloud-create-project]: https://cloud.google.com/resource-manager/docs/creating-managing-projects#creating_a_project

[google-cloud-management]: https://cloud.google.com/resource-manager/docs/creating-managing-projects

[google-cloud-platform-console]: https://console.cloud.google.com/

[google-cloud-oauth]: https://support.google.com/cloud/answer/6158849

[google-enable-disable-apis]: https://support.google.com/googleapi/answer/6158841

[google-managing-service-accounts]: https://cloud.google.com/iam/docs/creating-managing-service-accounts

[google-oauth-scopes]: https://developers.google.com/identity/protocols/oauth2/scopes

[google-service-accounts]: https://cloud.google.com/iam/docs/service-accounts

[sync-docs]: ../../administration-guide/01-managing-databases.html#choose-when-metabase-syncs-and-scans

[troubleshooting-data-sources]: ../../troubleshooting-guide/index.html#databases
