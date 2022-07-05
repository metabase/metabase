***

## título: Compartir e incrustar paneles o preguntas

## Compartir e incrustar paneles o preguntas

A veces querrás compartir un panel o una pregunta que hayas guardado con alguien que no forme parte de tu organización o empresa, o con alguien que no necesite acceso a tu instancia completa de Metabase. Metabase permite a los administradores crear enlaces públicos e incrustaciones simples para permitirle hacer precisamente eso.

### Activar enlaces públicos

![Enable public sharing](images/public-links/enable-public-sharing.png)
Lo primero es lo primero, deberá ir al Panel de administración y habilitar el uso compartido público. En el futuro, verá paneles y preguntas que ha compartido enumerados aquí, y podrá revocar cualquier enlace público que ya no desee que se use.

### Habilitar el uso compartido en el panel o la pregunta guardada

![Enable sharing](images/public-links/enable-links.png)

A continuación, salga del Panel de administración y vaya a la pregunta que desea compartir, luego haga clic en el botón `Sharing and Embedding` en la parte inferior derecha de la pantalla (parece una flecha apuntando hacia arriba y hacia la derecha). Luego haga clic en el interruptor para habilitar el uso compartido público para esta pregunta.

En el caso de un tablero, el botón se encuentra en la parte superior derecha de la página.

### ¡Copia, pega y comparte!

Ahora simplemente copie y comparta la URL del enlace público con quien desee. Si desea incrustar su panel o pregunta en una página web simple o publicación de blog, copie y pegue el fragmento de iframe en el destino de su elección.

### Asignar valores a los filtros u ocultarlos a través de la URL

Esto es un poco más avanzado, pero si está incrustando un panel o pregunta en un iframe y tiene uno o más widgets de filtro, puede dar esos valores de filtros e incluso ocultar uno o más filtros agregando algunas opciones al final de la URL. (También puede hacer esto cuando simplemente comparte un enlace, pero tenga en cuenta que si lo hace, la persona con la que está compartiendo el enlace podría, por supuesto, editar directamente la URL para cambiar los valores de los filtros, o para cambiar qué filtros están ocultos o no).

Aquí hay un ejemplo en el que tenemos un panel que tiene un par de filtros, uno de los cuales se llama "ID". Podemos darle a este filtro un valor de 7 y simultáneamente evitar que aparezca el widget de filtro construyendo nuestra URL de esta manera:

    /dashboard/42?id=7#hide_parameters=id

Tú no *have* sin embargo, para asignar un valor a un filtro, si solo desea ocultarlo, de modo que no se pueda usar en este contexto, puede hacer lo siguiente:

    /dashboard/42#hide_parameters=id

Tenga en cuenta que el nombre del filtro en la dirección URL debe especificarse en minúsculas y con guiones bajos en lugar de espacios. Entonces, si su filtro se llamara "Filtro para el código postal del usuario", escribiría:

    /dashboard/42#hide_parameters=filter_for_user_zip_code

Puede especificar varios filtros para ocultar separándolos con comas, como esta:

    /dashboard/42#hide_parameters=id,customer_name

Sin embargo, para especificar varios valores para los filtros, deberá separarlos con ampersands (&), de la siguiente manera:

    /dashboard/42?id=7&customer_name=janet

***

## Siguiente: incrustar paneles y gráficos en otras aplicaciones

Si está tratando de hacer una incrustación más compleja e integrada en su propia aplicación web, puede consultar el [documentación para esa característica](13-embedding.md).
