***

## title: Información general sobre permisos

# Información general sobre permisos

Siempre habrá bits de información confidenciales en sus datos, y afortunadamente Metabase proporciona un amplio conjunto de herramientas para garantizar que las personas de su equipo solo vean los datos que se supone que deben ver.

Si, en cambio, se está preguntando qué Metabase de datos puede ver la empresa, consulte nuestra página en [privacidad y seguridad de los datos](https://www.metabase.com/security).

## Puntos clave con respecto a los permisos

*   Se conceden permisos a [grupos](04-managing-users.md#groups), no personas.
*   Las personas pueden estar en más de un grupo.
*   Si una persona está en varios grupos, tendrá el *más permisivo* acceso concedido a ellos en todos sus grupos. Por ejemplo, si una persona está en tres grupos, y cualquiera de esos grupos tiene acceso a una base de datos, entonces esa persona tendrá acceso a esa base de datos.

## En qué puede establecer permisos

*   [Permisos de datos](#data-permissions)
*   [Permisos de recopilación](#collection-permissions)
*   [Permisos de aplicación](#application-permissions)
*   [Permisos de carpeta de fragmentos de código SQL](#sql-snippet-folder-permissions)

### Permisos de datos

*   [Bases de datos conectadas a la metabase][data-permissions]
*   [Tablas y esquemas][table-permissions] en esas bases de datos
*   [Filas y columnas][data-sandboxing], también conocido como sandboxing de datos (disponible en planes de pago)

### Permisos de recopilación

[Permisos de recopilación][collections] dictar qué grupos pueden ver/editar elementos de colecciones, incluyendo:

*   Preguntas
*   Paneles
*   Modelos
*   Eventos
*   Cronología

### Permisos de aplicación

[Permisos de aplicación](application-permissions.md) (disponible en planes de pago) dicta el acceso a las funciones de nivel de aplicación de Metabase, que incluyen:

*   **Configuración**: la pestaña Configuración del panel De administración.
*   **Supervisión del acceso**: las fichas Herramientas, Auditoría y Solución de problemas del panel Administración.
*   **Suscripciones y alertas**. Qué grupos pueden crear/editar suscripciones y alertas de panel.

### Permisos de carpeta de fragmentos de código SQL

Para planes que incluyen [Carpetas de fragmentos de código SQL][sql-snippet-folders], también puede establecer permisos en esas carpetas.

## Cambio de permisos

Cada vez que cambie los permisos de un grupo, asegúrese de:

*   Guarde los cambios.
*   Haga clic en Sí para confirmar sus opciones.

## Lecturas adicionales

*   [Gestión de personas y grupos](04-managing-users.md)
*   [Guía de permisos][permissions] en Learn Metabase
*   [Solución de problemas de permisos][troubleshooting-permissions]

[collections]: 06-collections.md

[dashboard-subscriptions]: ../users-guide/dashboard-subscriptions.md

[data-permissions]: data-permissions.md

[pulses]: ../users-guide/10-pulses.md

[data-sandboxing]: ../enterprise-guide/data-sandboxes.md

[permissions]: /learn/permissions/

[sandbox-columns]: /learn/permissions/data-sandboxing-column-permissions.html

[sandbox-rows]: /learn/permissions/data-sandboxing-row-permissions.html

[slack-integration]: 09-setting-up-slack.md

[sql-snippet-folders]: ../enterprise-guide/sql-snippets.html

[table-permissions]: data-permissions.md#table-permissions

[troubleshooting-permissions]: ../troubleshooting-guide/permissions.html
