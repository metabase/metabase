***

## título: Accesibilidad en metabase

# Accesibilidad en la metabase

La metabase aún no es totalmente compatible con [el estándar de la Sección 508 del gobierno federal de los Estados Unidos][508-accessibility]. Algunas áreas específicas en las que Metabase todavía tenemos trabajo por hacer incluyen:

*   La metabase carece de un método que permita a los lectores de pantalla omitir elementos de navegación repetitivos.
*   La metabase es extremadamente cercana, pero no cumple al 100% al proporcionar equivalentes de texto para todos los elementos que no son de texto.
*   La mayoría de nuestros elementos de formulario se pueden seleccionar mediante tabulación a través de elementos.
*   Metabase tiene animaciones de transición mínimas, pero aún no hemos probado si el rango de parpadeo está siempre entre 2 y 55 Hertz. Si has optado por [Reducir el movimiento / Eliminar animación](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion#user_preferences) configuración en su sistema operativo para aprovechar el `prefers-reduced-motion` Función de medios CSS, Metabase deshabilitará las animaciones.
*   Las tablas de datos de la metabase no tienen encabezados de fila y columna identificados en el marcado.
*   Todavía no tenemos una descripción publicada de nuestras características de accesibilidad y compatibilidad.
*   Dado que Metabase es una aplicación web basada en React, no puede funcionar sin secuencias de comandos (es decir, JavaScript) activadas.

Si desea ayudarnos a abordar estas brechas de accesibilidad, consulte [nuestra guía para desarrolladores][developers-guide].

[508-accessibility]: https://section508.gov/

[developers-guide]: /docs/latest/developers-guide.html
