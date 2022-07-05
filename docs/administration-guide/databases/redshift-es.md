***

## título: Redshift

# Corrimiento al rojo

## Información de conexión

Para conectarse a una base de datos de Redshift, necesitará:

*   Host (por ejemplo, my-cluster-name.abcd1234.us-east-1.redshift.amazonaws.com)
*   Puerto (por ejemplo, 5439)
*   Nombre de la base de datos (por ejemplo, birds_of_the_world)

También deberá ingresar un nombre para mostrar (el nombre para mostrar aparece en el cuadro **Examinar datos** y otros menús en Metabase).

## Esquemas

Aquí puede especificar qué esquemas desea sincronizar y escanear. Las opciones son:

*   Todo
*   Sólo estos...
*   Todos excepto...

Para el **Sólo estos** y **Todos excepto** puede introducir una lista de valores separados por comas para indicar a la metabase qué esquemas desea incluir (o excluir). Por ejemplo:

    foo,bar,baz

Puede utilizar el `*` comodín para que coincida con varios esquemas.

Digamos que tienes tres esquemas: foo, bar y baz.

*   Si tiene **Sólo estos...** set, e introduzca la cadena `b*`, sincronizarás con bar y baz.
*   Si tiene **Todos excepto...** set, e introduzca la cadena `b*`, solo sincronizarás foo.

Tenga en cuenta que sólo el `*` se admite comodín; no puede usar otros caracteres especiales o regexes.
