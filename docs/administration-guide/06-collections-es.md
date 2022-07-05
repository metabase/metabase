***

## title: Permisos de colección

# Permisos de recopilación

![Collection detail](images/collections/collection-detail.png)

Puedes usar [colecciones](../users-guide/collections) para organizar preguntas, paneles, modelos, líneas de tiempo y otras colecciones. Puede establecer permisos en esas colecciones para determinar qué grupos de personas pueden ver y seleccionar los elementos de las colecciones.

La metabase comienza con una colección de nivel superior predeterminada que se llama **Nuestros análisis**, en el que se guardan todas las demás colecciones.

## Niveles de permisos de recopilación

*   **Acceso de curaduría**: el usuario puede editar, mover, archivar y anclar elementos guardados en esta colección, y puede guardar o mover nuevos elementos a ella. También pueden crear nuevas subcolecciones dentro de esta colección. Para archivar una subcolección dentro de esta colección, deberán tener acceso a Curate para ella y todas y cada una de las colecciones dentro de ella.
*   **Ver acceso**: las personas del grupo pueden ver todas las preguntas, cuadros de mando y modelos de la colección. Si una persona carece de permiso para ver algunas o todas las preguntas incluidas en un panel determinado, entonces esas preguntas serán invisibles para ellos; pero cualquier pregunta que se guarde en esta colección *será* ser visible para ellos, *incluso si la persona carece de acceso a los datos subyacentes utilizados en la pregunta.*
*   **Sin acceso**: las personas del grupo no verán esta colección en la lista y carecerán de acceso a ninguno de los elementos guardados en ella.

### Configuración de permisos para colecciones

Puede establecer permisos en colecciones haciendo clic en el icono de candado en la parte superior derecha de la pantalla mientras ve la colección y hace clic en **Editar permisos**. Solo los administradores pueden editar los permisos de colección. Cada [grupo de usuarios](05-setting-permissions.md) puede tener View, Curate o No access a una colección:

![Permissions](images/collections/collection-permissions.png)

Si desea ver una imagen más amplia de los permisos que tienen sus grupos de usuarios para todas sus colecciones, simplemente haga clic en el enlace que dice **Ver todos los permisos de recopilación**, que le lleva al Panel de administración. Verá una lista de sus colecciones a lo largo de la izquierda, y al hacer clic en cualquiera de ellas aparecerá una lista de la configuración de permisos de cada grupo para esa colección.

![Collection Permissions](images/collections/admin-panel-collections.png)

Al igual que con los permisos de acceso a datos, los permisos de recopilación son *aditivo*, lo que significa que si un usuario pertenece a más de un grupo, si uno de sus grupos tiene una configuración más restrictiva para una colección que otro de sus grupos, se le dará el *más permisivo* ajuste. Esto es especialmente importante recordarlo cuando se trata del grupo Todos los usuarios: dado que todos los usuarios son miembros de este grupo, si le da al grupo Todos los usuarios Curate acceso a una colección, entonces *todo* los usuarios tendrán acceso a Curate para esa colección, incluso si también pertenecen a un grupo con *menos* acceso que eso.

### Permisos y subrecolección

A un grupo se le puede dar acceso a una colección ubicada en algún lugar dentro de una o más subcolecciones *sin* teniendo que tener acceso a todas las colecciones "por encima" de ella. Por ejemplo, si un grupo tuviera acceso a la "Super Colección Secreta" que ha guardado varias capas en lo profundo de una colección de "Marketing" a la que el grupo carece de acceso, la "Colección Súper Secreta" aparecería en el nivel más alto que el grupo. *hace* tener acceso a.

### Archivar colecciones

Los usuarios con permiso de curación para una colección pueden archivar colecciones. Haga clic en el icono de edición en la parte superior derecha de la pantalla de la colección y seleccione **Archivar esta colección** para archivarlo. Esto también archivará todas las preguntas, tableros, modelos y todas las demás subcolecciones y su contenido. Es importante destacar que esto también eliminará cualquier pregunta archivada de todos los paneles que las utilicen.

Puedes *desarchivar* Artículos. En la barra lateral de la lista Colecciones, en la parte inferior, haga clic en **Ver archivo**. Busque el elemento que desea desarchivar (deberá desplazarse hacia abajo en la página o usar la funcionalidad buscar en la página del navegador, ya que los elementos archivados no aparecerán en los resultados de búsqueda de Metabase). Seleccione el cuadro abierto con un icono de flecha hacia arriba para "Desarchivar esto".

## Anclar elementos en colecciones

![Pins](images/collections/pinned-items.png)

Las personas de grupos con acceso de Curate a una colección pueden anclar elementos de la colección. Anclar un artículo de una colección convierte el artículo en una bonita tarjeta en la parte superior de la colección.

Para anclar un elemento, seleccione el botón **icono de pin** junto al nombre del elemento.

Tenga en cuenta que las colecciones en sí mismas no se pueden fijar. Si estás corriendo en un [plan pagado](https://www.metabase.com/pricing), los administradores pueden designar [Colecciones Oficiales][offical-collections].

## Colecciones especiales

La colección "Nuestros análisis" y las colecciones personales individuales son invencibles; no pueden ser archivados, heridos o asesinados. Son eternos.

### Colecciones personales

Cada persona tiene una colección personal en la que siempre se le permite guardar cosas, incluso si no tiene permisos de cura para ninguna otra colección.

Los administradores pueden ver y editar el contenido de la colección personal de cada usuario (incluso los que pertenecen a otros administradores) haciendo clic en el botón **Colecciones personales de otros usuarios** en la parte inferior de la barra lateral al ver "Nuestros análisis".

Una colección personal funciona como cualquier otra colección, excepto que sus permisos son fijos y no se pueden cambiar. Si una subrecolección dentro de una colección personal se mueve a una colección diferente, la subrecolección heredará los permisos de su nueva colección principal.

## Lecturas adicionales

*   [Trabajar con permisos de recopilación][collection-permissions].

[collections]: 06-collections.md

[collection-permissions]: /learn/permissions/collection-permissions.html

[dashboard-subscriptions]: ../users-guide/dashboard-subscriptions.md

[data-permissions]: data-permissions.md

[pulses]: ../users-guide/10-pulses.md

[data-sandboxing]: ../enterprise-guide/data-sandboxes.md

[offical-collections]: ../users-guide/collections.html#official-collections

[permissions]: /learn/permissions/

[sandbox-columns]: /learn/permissions/data-sandboxing-column-permissions.html

[sandbox-rows]: /learn/permissions/data-sandboxing-row-permissions.html

[slack-integration]: 09-setting-up-slack.md

[sql-snippet-folders]: ../enterprise-guide/sql-snippets.md

[table-permissions]: data-permissions.md#table-permissions
