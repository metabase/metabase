***

## título: Idiomas y localización

# Idiomas y localización

## Idiomas admitidos

Gracias a nuestra increíble comunidad de usuarios, Metabase ha sido traducida a muchos idiomas diferentes. Debido a [la forma en que recopilamos traducciones](#policy-for-adding-and-removing-translations), los idiomas se pueden agregar o eliminar durante las versiones principales dependiendo de la cobertura de la traducción.

Los idiomas que puede elegir actualmente son:

*   Inglés (predeterminado)
*   Búlgaro
*   Catalán
*   Chino (simplificado)
*   Chino (tradicional)
*   Checo
*   Holandés
*   Farsi/Persa
*   Francés
*   Alemán
*   Indonesio
*   Italiano
*   Japonés
*   Noruego Bokmål
*   Polaco
*   Portugués
*   Ruso
*   Serbio
*   Eslovaco
*   Español
*   Sueco
*   Turco
*   Ucraniano
*   Vietnamita

## Política para agregar y quitar traducciones

Nuestra comunidad contribuye a las traducciones de Metabase en nuestro [Proyecto POEditor][metabase-poe]. Si quieres ayudar a que Metabase esté disponible en un idioma que domines, ¡nos encantaría que nos ayudaras!

Para que una nueva traducción se agregue a la Metabase, debe alcanzar el 100%. Una vez que lo haga, lo agregamos en la próxima versión principal o menor de Metabase. Todo *existente* traducciones en Metabase *debe permanecer al 100%* para seguir siendo incluido en el siguiente *destacado* versión de Metabase. Esta regla garantiza que nadie encuentre una mezcla confusa de inglés y otro idioma al usar Metabase.

Entendemos que este es un listón alto, por lo que nos comprometemos a asegurarnos de que antes de cada lanzamiento principal, cualquier adición o cambio en el texto en el producto se complete al menos 10 días calendario antes de que se envíe el lanzamiento, momento en el que notificamos a todos los traductores que pronto se realizará una nueva versión.

Tenga en cuenta que, si bien solo eliminamos idiomas en las versiones principales, nos complace volver a agregarlos para las versiones menores, por lo que siempre es un buen momento para saltar y comenzar a traducir.

[metabase-poe]: https://poeditor.com/join/project/ynjQmwSsGh

## Localización

El **Localización** la configuración le permite establecer valores predeterminados globales para la instancia de metabase. La configuración de localización incluye opciones para:

*   **Idioma**
*   **Fecha y hora**
*   **Números**
*   **Divisa**

El **Localización** la configuración se puede encontrar en el **Panel de administración** en virtud del **Configuración** pestaña.

### Idioma de la instancia

El idioma predeterminado para todos los usuarios en la interfaz de usuario de la metabase, los correos electrónicos del sistema, los pulsos y las alertas. Los usuarios pueden elegir un idioma diferente desde la página de configuración de su propia cuenta.

### Primer día de la semana

Si es necesario, puede cambiar el primer día de la semana para su instancia (el valor predeterminado es domingo). Establecer el primer día de la semana afecta a cosas como agrupar por semana y filtrar en preguntas creadas con el [generador de consultas](../users-guide/04-asking-questions.html). Esta configuración no afecta [Consultas SQL](../users-guide/writing-sql.html).

### Opciones de localización

**Fechas y Horarios**

*   `Date style:` la forma en que las fechas deben mostrarse en tablas, etiquetas de ejes e información sobre herramientas.
*   `Date separators:` puedes elegir entre barras, guiones y puntos aquí.
*   `Abbreviate names of days and months:` siempre que se muestre una fecha con el día de la semana y/o el mes escrito, se mostrará esta configuración, por ejemplo. `January` como `Jan` o `Monday` como `Mon`.
*   `Time style:` esto le permite elegir entre un reloj de 12 horas o 24 horas para mostrar la hora de forma predeterminada cuando corresponda.

**Números**

*   `Separator style:` algunas personas usan comas para separar miles de lugares, y otras usan puntos. Aquí es donde puedes indicar a qué campamento perteneces.

**Divisa**

*   `Unit of currency:` si hace la mayor parte de su negocio en una moneda en particular, puede especificarlo aquí.
*   `Currency label style:` si desea que sus monedas estén etiquetadas con un símbolo, un código (como `USD`), o su nombre completo.
*   `Where to display the unit of currency:` esto se refiere específicamente a las tablas y le permite elegir si desea que las etiquetas de moneda aparezcan solo en el encabezado de la columna o junto a cada valor de la columna.
