# Documentación de la API de metabase

*Estos archivos de referencia se generaron a partir de comentarios de origen ejecutando `clojure -M:ee:run api-documentation`*.

## Acerca de la API de metabase

*   **La API está sujeta a cambios.** La API está estrechamente acoplada con el front-end y está sujeta a cambios entre versiones. Es probable que los puntos de enlace no cambien tanto (los puntos de enlace de API existentes se cambian con poca frecuencia y se eliminan raramente), pero si escribe código para usar la API, es posible que tenga que actualizarlo en el futuro.
*   **La API no tiene versiones.** Significado: puede cambiar de versión a versión, así que no espere permanecer en una versión particular de Metabase para usar una API "estable".

## Tutorial de API

Echa un vistazo a una introducción a la [Metabase API](https://www.metabase.com/learn/administration/metabase-api.html).

## Puntos de enlace de API

*\* indica los puntos finales utilizados para las funciones disponibles en [planes pagados](https://www.metabase.com/pricing/).*

*   [Actividad](api/activity.md)
*   [Aplicación de permisos avanzados\*](api/ee/advanced-permissions-application.md)
*   [Alerta](api/alert.md)
*   [Auditar al usuario de la aplicación\*](api/ee/audit-app-user.md)
*   [Paneles de control de Automagic](api/automagic-dashboards.md)
*   [Marcador](api/bookmark.md)
*   [Tarjeta](api/card.md)
*   [Colección](api/collection.md)
*   [Revisión de la gestión de contenido\*](api/ee/content-management-review.md)
*   [Salpicadero](api/dashboard.md)
*   [Base de datos](api/database.md)
*   [Conjunto de datos](api/dataset.md)
*   [Correo electrónico](api/email.md)
*   [Insertar](api/embed.md)
*   [Campo](api/field.md)
*   [GeoJSON](api/geojson.md)
*   [LDAP](api/ldap.md)
*   [Historial de inicio de sesión](api/login-history.md)
*   [Métrico](api/metric.md)
*   [Fragmento de consulta nativo](api/native-query-snippet.md)
*   [Notificar](api/notify.md)
*   [Permisos](api/permissions.md)
*   [Persistir](api/persist.md)
*   [Características premium](api/premium-features.md)
*   [Vista previa incrustar](api/preview-embed.md)
*   [Público](api/public.md)
*   [Pulso](api/pulse.md)
*   [Revisión](api/revision.md)
*   [STOM](api/ee/sso.md)
*   [Sandbox GTAP\*](api/ee/sandbox-gtap.md)
*   [Tabla sandbox\*](api/ee/sandbox-table.md)
*   [Usuario de Sandbox\*](api/ee/sandbox-user.md)
*   [Buscar](api/search.md)
*   [Segmento](api/segment.md)
*   [Sesión](api/session.md)
*   [Ajuste](api/setting.md)
*   [Arreglo](api/setup.md)
*   [Flojo](api/slack.md)
*   [Mesa](api/table.md)
*   [Tarea](api/task.md)
*   [Losa](api/tiles.md)
*   [Línea de tiempo](api/timeline.md)
*   [Evento de línea de tiempo](api/timeline-event.md)
*   [Transformar](api/transform.md)
*   [Usuario](api/user.md)
*   [Utilidad](api/util.md)
