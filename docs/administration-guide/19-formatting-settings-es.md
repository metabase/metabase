***

## title: Configuración del formato predeterminado para los datos

## Configuración del formato predeterminado de los datos

Hay usuarios de Metabase en todo el mundo, cada uno con diferentes preferencias sobre cómo se deben formatear y mostrar las fechas, horas, números y monedas. Metabase le permite personalizar estas opciones de formato en tres niveles diferentes:

1.  **Global**. Establecer valores predeterminados globales en el cuadro [Localización](localization.md) en Admin -> Configuración -> Localización.
2.  **Campo**.  Establezca los valores predeterminados del campo (columna) en Admin -> Data Model. Los valores predeterminados de campo anulan los valores predeterminados globales.
3.  **Pregunta**. Establezca los valores predeterminados de formato para preguntas individuales en la configuración de visualización de esa pregunta. Los valores predeterminados de las preguntas anulan los valores predeterminados globales y de campo.

### Formato a nivel de campo

Puede invalidar los valores predeterminados globales para un campo específico yendo al `Data Model` del Panel de administración, seleccionando la base de datos y la tabla del campo en cuestión, y haciendo clic en el icono de engranaje en el extremo derecho de la pantalla junto a ese campo para ir a su página de opciones, luego haciendo clic en el botón `Formatting` pestaña.

Las opciones que verás aquí dependerán del tipo de campo. Por lo general, son las mismas opciones que en la configuración de formato global, con algunas adiciones:

**Fechas y Horarios**

*   `Show the time:` esto le permite elegir si este campo de tiempo debe mostrarse de forma predeterminada sin la hora; con horas y minutos; con horas, minutos y segundos; o adicionalmente con milisegundos.

**Números**

*   `Show a mini bar chart:` esto solo se aplica a situaciones en las que este número se muestra en una tabla y, si está en ella, mostrará una barra junto a cada valor de esta columna para mostrar qué tan grande o pequeño es en relación con los otros valores de la columna.
*   `Style:` le permite elegir mostrar el número como un número simple, un porcentaje, en notación científica o como moneda.
*   `Separator style:` esto le da varias opciones sobre cómo se usan las comas y los puntos para separar el número.
*   `Minimum number of decimal places:` fuerza el número a mostrarse con exactamente tantos decimales.
*   `Multiply by a number:` multiplica este número por lo que escriba aquí.
*   `Add a prefix/suffix:` le permite poner un símbolo, palabra, etc. antes o después de este número.

**Divisa**
La configuración de formato de campo de moneda incluye las mismas opciones que en la sección de formato global, así como todas las opciones que tienen los campos Número.

### Formato a nivel de pregunta

Por último, puede anular todas las configuraciones de formato en cualquier pregunta guardada específica o tarjeta de tablero haciendo clic en el engranaje para abrir las opciones de visualización. Para restablecer cualquier configuración anulada a la predeterminada, simplemente haga clic en el icono de flecha giratoria junto a la etiqueta de la configuración. Esto restablecerá la configuración a la configuración de nivel de campo si hay una; de lo contrario, se restablecerá al valor predeterminado global.

***

## Siguiente: almacenamiento en caché de resultados de consultas

Metabase hace que sea fácil de [almacenar automáticamente en caché los resultados](14-caching.md) para consultas que tardan mucho tiempo en ejecutarse.
