***

## título: Permisos de datos

# Permisos de datos

Esta página cubre los permisos para bases de datos y tablas. Si aún no lo has hecho, echa un vistazo a nuestro [Información general sobre permisos][permissions-overview].

## Vista de permisos

Ahora que tiene algunos grupos, querrá controlar su acceso a los datos yendo a **Configuración de administración** > **Permisos**. Verá una tabla interactiva que muestra todas las bases de datos y todos los grupos, y el nivel de acceso que tienen los grupos para cada base de datos.

## Establecer permisos en una base de datos

Puede establecer varios niveles de permisos en un origen de datos, desde consultar el acceso hasta administrar la conexión de la base de datos.

*   [Acceso a datos](#data-access)
*   [Consultas nativas](#native-querying)
*   [Descargar resultados](#download-results)\*
*   [Administrar modelo de datos](#manage-data-model)\*
*   [Administrar base de datos](#manage-database)\*

\* Disponible en planes de pago.

## Acceso a datos

Puede hacer clic en cualquier celda de la tabla de permisos para cambiar el nivel de acceso de un grupo. Cuando haya terminado de realizar los cambios, simplemente haga clic en el botón **Guardar cambios** en la parte superior derecha, verá un cuadro de diálogo de confirmación que resume los cambios.

### Acceso sin restricciones

Los miembros del grupo pueden acceder a los datos de todas las tablas (dentro de todos los espacios de nombres/esquemas, si la base de datos los utiliza), incluidas las tablas que puedan agregarse a esta base de datos en el futuro.

### Acceso granular

**Acceso granular** permite a los administradores establecer explícitamente el acceso a tablas o esquemas dentro de una base de datos. En la práctica, esto significa que:

*   Los administradores pueden establecer el acceso de los grupos a las tablas individuales en **Irrestricto**, **Sin autoservicio**o **Espacio aislado** acceso.
*   Si se agrega una nueva tabla a esta base de datos en el futuro, el grupo no tendrá acceso a esa nueva tabla. Un administrador tendría que conceder explícitamente acceso a esa tabla.

### Sin acceso de autoservicio

**Sin autoservicio** impide que las personas de un grupo creen nuevas consultas o preguntas ad hoc basadas en estos datos o que vean estos datos en la pantalla Examinar datos. Los grupos con este nivel de acceso aún pueden ver las preguntas y gráficos guardados en función de estos datos en las colecciones a las que tienen acceso.

### Bloquear el acceso

{% include plans-blockquote.html feature="Block access" %}

**Bloquear** garantiza que las personas nunca puedan ver los datos de esta base de datos, independientemente de sus permisos en el nivel de recopilación. Entonces, si quieren ver una pregunta en una colección a la que tienen acceso, pero esa pregunta usa datos de una base de datos que ha sido bloqueada para el grupo de esa persona, entonces no podrán ver esa pregunta.

Tenga en cuenta que las personas pueden estar en varios grupos. Si una persona pertenece a *otro* grupo que *hace* tienen acceso a esa base de datos, ese acceso más privilegiado tendrá prioridad (anulando el bloque), y podrán ver esa pregunta.

### Permisos de tabla

Al seleccionar [Acceso granular](#granular-access) para una base de datos, se le pedirá que establezca permisos en las tablas (o esquemas) dentro de esa base de datos. Aquí tendrás dos o tres opciones, dependiendo de tu plan Metabase.

#### Acceso sin restricciones a la tabla

Los grupos con acceso sin restricciones pueden hacer preguntas sobre esta tabla y ver las preguntas guardadas y las tarjetas del panel que usan la tabla.

#### Sin acceso de autoservicio a la mesa

Los grupos sin acceso de autoservicio a una tabla no pueden acceder a la tabla en absoluto. Sin embargo, pueden ver las preguntas que utilizan datos de esa tabla, siempre que el grupo tenga acceso a la colección de preguntas.

#### Acceso aislado a la tabla

{% include plans-blockquote.html feature="Data sandboxing" %}

El acceso aislado a una tabla puede restringir el acceso a columnas y filas de una tabla. Check-out [espacio aislado de datos][data-sandboxing].

## Consultas nativas

Los miembros de un grupo con edición de consultas nativa establecida en Sí pueden escribir nuevas consultas SQL/nativas mediante el comando [editor de consultas nativo](https://www.metabase.com/docs/latest/users-guide/writing-sql.html). Este nivel de acceso requiere que el grupo tenga además acceso a datos sin restricciones para la base de datos en cuestión, ya que las consultas SQL pueden eludir los permisos de nivel de tabla.

Las personas que no están en grupos con permisos de edición de consultas nativas podrán seguir viendo los resultados de las preguntas creadas a partir de SQL/consultas nativas, pero no el código en sí. Tampoco verán el **Ver el SQL** en el generador de consultas.

## Descargar resultados

{% include plans-blockquote.html feature="Permisos de descarga" %}

Puede establecer permisos sobre si las personas de un grupo pueden descargar resultados (y cuántas filas) de un origen de datos. Las opciones son:

*   No (no pueden descargar resultados)
*   Granular (desea establecer el acceso para tablas o esquemas individuales)
*   10 mil filas
*   1 millón de filas

## Administrar modelo de datos

{% include plans-blockquote.html feature="Permisos del modelo de datos" %}

Puede definir si un grupo puede [editar metadatos](03-metadata-editing.md). Las opciones son:

*   Sí (es decir, pueden editar metadatos para esa fuente de datos).
*   No
*   Granular (para establecer permisos específicos para cada tabla).

## Administrar base de datos

{% include plans-blockquote.html feature="Permisos de administración de bases de datos" %}

Esta configuración define si una persona puede editar la configuración de conexión para el origen de datos, así como para sincronizar y escanear la base de datos. Tenga en cuenta que esta configuración aún impide que las personas eliminen las conexiones de base de datos por completo. Solo los administradores pueden eliminar las conexiones de base de datos de la metabase.

## Lecturas adicionales

*   [Información general sobre permisos](05-setting-permissions.md)
*   [Permisos de aprendizaje](/learn/permissions)
*   [Solución de problemas de permisos](../troubleshooting-guide/permissions.md)
*   [Espacio aislado de datos: establecer permisos de nivel de fila][sandbox-rows]
*   [Espacio aislado de datos avanzado: limitar el acceso a las columnas][sandbox-columns]

[collections]: 06-collections.md

[dashboard-subscriptions]: ../users-guide/dashboard-subscriptions.md

[data-sandboxing]: ../enterprise-guide/data-sandboxes.md

[permissions-overview]: 05-setting-permissions.md

[sandbox-columns]: /learn/permissions/data-sandboxing-column-permissions.html

[sandbox-rows]: /learn/permissions/data-sandboxing-row-permissions.html

[sql-snippet-folders]: ../enterprise-guide/sql-snippets.md
