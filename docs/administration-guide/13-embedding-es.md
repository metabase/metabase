***

## título: Incrustación de metabase en otras aplicaciones

# Incrustación de metabase en otras aplicaciones

Metabase incluye una potente función de incrustación de aplicaciones que le permite incrustar sus preguntas o paneles guardados en sus propias aplicaciones web. Incluso puede pasar parámetros a estas incrustaciones para personalizarlas para diferentes usuarios.

## Conceptos clave

### Aplicaciones

Una distinción importante a tener en cuenta es la diferencia entre Metabase y la aplicación de incrustación. Los gráficos y paneles que incrustará en vivo en la aplicación Metabase y se incrustarán en su aplicación (es decir, la aplicación de incrustación).

### Parámetros

Algunos paneles y preguntas tienen la capacidad de aceptar [Parámetros](../users-guide/13-sql-parameters). En los cuadros de mando, estos son sinónimos de [filtros de panel](../users-guide/08-dashboard-filters). Por ejemplo, si tiene un panel con un filtro activado `Publisher ID`, esto se puede especificar como un parámetro al incrustar, de modo que pueda insertar el panel filtrado a un específico `Publisher ID`.

Las preguntas basadas en SQL con variables de plantilla también pueden aceptar parámetros para cada variable. Así que para una consulta como:

    SELECT count(*)
    FROM orders
    WHERE product_id = {% raw %}{{productID}}{% endraw %}

Podría especificar un `productID` al incrustar la pregunta.

### Parámetros firmados

En general, al incrustar un gráfico o panel, el servidor de la aplicación de incrustación deberá firmar una solicitud para ese recurso.

Si elige firmar un valor de parámetro específico, significa que el usuario no puede modificar ese valor, ni se muestra un widget de filtro para ese parámetro. Por ejemplo, si el `Publisher ID` se le asigna un valor y la solicitud está firmada, lo que significa que el cliente front-end que representa ese panel en nombre de un usuario que ha iniciado sesión determinado solo puede ver la información de ese ID de publicador.

## Habilitación de la incrustación

Para habilitar la incrustación, vaya al icono **Panel de administración** y selecciona **Incrustación en otras aplicaciones** desde la barra lateral izquierda. Al hacer clic en **Habilitar**, verás un **Incrustación de clave secreta** puede usarlo más adelante para firmar solicitudes. Si alguna vez necesita invalidar esa clave y generar una nueva, simplemente haga clic en **Regenerar clave**.
![Enabling Embedding](images/embedding/01-enabling.png)

También puede ver todas las preguntas y paneles que se han marcado como incrustados aquí, así como revocar cualquier pregunta o panel que ya no deba poder incrustarse en otras aplicaciones.

Una vez que haya habilitado la función de incrustación en su instancia de Metabase, a continuación querrá configurar preguntas y paneles individuales para incrustar.

## Incrustación de gráficos y paneles

Para que una pregunta o panel se pueda incrustar, haga clic en el botón **icono de flecha** en la parte inferior derecha.

![Share icon](images/embedding/02-share-icon.png)

A continuación, seleccione **Insertar esta pregunta en una aplicación**.

![Enable sharing for a question](images/embedding/03-enable-question.png)

Verá una vista previa de la pregunta o el panel tal como aparecerá en su aplicación, así como un panel que muestra el código que deberá insertar en su aplicación. Puede alternar entre la vista previa y el código con el interruptor cerca de la parte superior de la página.

![Preview](images/embedding/04-preview.png)

Importante: tendrás que pulsar **Publicar** Cuando configura por primera vez un gráfico o panel para incrustar *y* cada vez que cambie la configuración de incrustación. Además, cualquier cambio que realice en el recurso puede requerir que actualice el código en su propia aplicación para que coincida con el ejemplo de código más reciente de este panel.

![Code samples for embedding](images/embedding/05-code.png)

La metabase proporciona ejemplos de código para lenguajes de plantillas front-end comunes, así como algunos frameworks y lenguajes web back-end comunes. También puede usarlos como puntos de partida para escribir sus propias versiones en otras plataformas.

## Incrustación de gráficos y paneles con parámetros bloqueados

Si desea tener un parámetro bloqueado para evitar que los usuarios finales de la aplicación de incrustación vean los datos de otros usuarios, puede marcar los parámetros como "Bloqueado". Esto evitará que ese parámetro se muestre como un widget de filtro, por lo que su valor debe ser establecido por el código del servidor de la aplicación de incrustación.

![Locked parameters](images/embedding/06-locked.png)

Cuando se utilizan filtros de campo bloqueados con varios valores seleccionados, se proporciona como una matriz JSON. Ejemplo:

    ...
    params: {
      foo: ['Value1', 'Value2'],
    },
    ...

## Ocultar parámetros

Si tiene parámetros que no son necesarios, pero que le gustaría que se ocultaran, en lugar de marcarlos como Bloqueados, puede usar el botón `hide_parameters` Opción de URL para ocultar uno o más parámetros (es decir, evitar que aparezca como un widget de filtro en la pantalla). Querrá agregar esta opción a la URL de la metabase especificada en el iframe de incrustación.

Por ejemplo, si tiene un parámetro llamado "ID", en este ejemplo se ocultará el widget de filtro de ID:

    /dashboard/42#hide_parameters=id

Si lo desea, también puede asignar simultáneamente un valor a un parámetro y ocultar el widget de esta manera:

    /dashboard/42?id=7#hide_parameters=id

Tenga en cuenta que el nombre del parámetro en la dirección URL debe especificarse en minúsculas y con guiones bajos en lugar de espacios. Entonces, si su parámetro se llamara "Filtro para el código postal del usuario", escribiría:

    /dashboard/42#hide_parameters=filter_for_user_zip_code

Puede especificar varios parámetros para ocultar separándolos con comas, como este:

    /dashboard/42#hide_parameters=id,customer_name

Sin embargo, para especificar varios valores para los filtros, deberá separarlos con ampersands (&), de la siguiente manera:

    /dashboard/42?id=7&customer_name=janet

## Cambiar el tamaño de los paneles para que se ajusten a su contenido

Los paneles de control tienen una relación de aspecto fija, por lo que si desea asegurarse de que tengan un tamaño vertical automático para adaptarse a su contenido, puede usar el [Redimensionador iFrame](https://github.com/davidjbradshaw/iframe-resizer) Guión. Metabase sirve una copia para mayor comodidad:

    <script src="http://metabase.example.com/app/iframeResizer.js"></script>
    <iframe src="http://metabase.example.com/embed/dashboard/TOKEN" onload="iFrameResize({}, this)"></iframe>

## Parámetros adicionales

Para cambiar la apariencia de la inserción, puede agregar parámetros adicionales a la URL de incrustación:

*   **Confinado**: verdadero o falso. Agrega un borde visible a la inserción.
*   **titulado**: verdadero o falso. Agrega o quita el título a la incrustación.
*   **tema**: nulo o nocturno. Muestra el iframe incrustado en modo oscuro.

Por ejemplo:

    http://yourmetabaseurl.com/embed/dashboard/a_very_huge_hashed_url#theme=night&hide_parameters=category&titled=true&bordered=false

Estos ajustes también se pueden cambiar en **Estilo** al obtener una vista previa de la pregunta o panel incrustado y su código en la metabase.

## Aplicaciones de referencia

Para ver ejemplos concretos de cómo integrar Metabase en aplicaciones bajo una serie de marcos comunes, consulte nuestro [implementaciones de referencia](https://github.com/metabase/embedding-reference-apps) en Github.

## Lecturas adicionales

Echa un vistazo a la [Pista de incrustación](/learn/embedding) en Learn Metabase.
