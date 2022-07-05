***

## título: Gracias

## Gracias

En primer lugar, ¡gracias por su interés en Metabase y por querer contribuir!

En esta guía, discutiremos cómo se construye metabase. Esto debería darle una buena idea de nuestro proceso y dónde es posible que desee encajar.

## Lo que estamos tratando de construir

Metabase se trata de permitir que los usuarios no técnicos tengan acceso a los datos de su organización. Estamos tratando de maximizar la cantidad de energía que puede ser utilizada cómodamente por alguien que entiende su negocio, está cuantitativamente doblado, pero probablemente solo se sienta cómodo con Excel.

Es importante tener en cuenta estos objetivos del proyecto Metabase. Muchas veces
las propuestas se marcarán como "Fuera del alcance" o se despriorizarán de otro modo. Esto no significa que la propuesta no sea útil, o que no nos interese verla hecha como un proyecto paralelo o como una rama experimental. Sin embargo, significa que no señalaremos al equipo central o a los contribuyentes a él en el corto plazo. Los problemas que están ligeramente fuera del alcance se mantendrán abiertos en caso de que haya apoyo de la comunidad (e idealmente contribuciones).

Para tener una idea de los objetivos finales, asegúrese de leer el [Zen de la Metabase](https://github.com/metabase/metabase/blob/master/zen.md).

## Nuestro proceso de producto:

El equipo central ejecuta un proceso de producto bastante bien definido. Se está modificando activamente, pero la siguiente es una descripción bastante fiel de ella en el momento de escribir este artículo. Debe tener una idea clara de cómo trabajamos antes de saltar con un PR.

### A) Identificar las necesidades de productos de la comunidad

Buscamos activamente nuevas ideas de características de nuestra comunidad, base de usuarios y nuestro propio uso de Metabase internamente. Nos concentramos en lo subyacente *problema* o *necesitar*  a diferencia de las solicitudes de características específicas. Si bien a veces las características sugeridas se crean según lo solicitado, a menudo encontramos que implican cambios en las características existentes y tal vez una solución completamente diferente al problema subyacente. Por lo general, se recopilarán en una serie de números y se etiquetarán [Propuesta](https://github.com/metabase/metabase/labels/.Proposal)

### B) Sintetizar estas necesidades en una característica concreta

Por lo general, recopilaremos un grupo de problemas o sugerencias en un nuevo concepto de característica principal. Por lo general, crearemos un documento de trabajo que recopile todas las "preguntas abiertas" con respecto a lo que la función debe hacer y, lo que es más importante, no hacer. Charlaremos con nuestros usuarios, tal vez haremos entrevistas en profundidad y, en general, trataremos de definir bien la función. Si una característica parece que necesitará tiempo para ser discutida y analizada, se etiquetará [Propuesta/En discusión](https://github.com/metabase/metabase/labels/.Proposal%2FBeing%20Discussed) para significar que todavía se está debatiendo activamente.

### C) Diseñar la característica

Una vez que se ha definido una característica, normalmente será asumida por un diseñador de productos. Aquí, producirán simulacros de baja fidelidad, obtendrán comentarios de nuestros usuarios y comunidad, e iterarán.

Una vez que se hayan marcado los flujos principales de UX, habrá un diseño visual de alta fidelidad.

Las características que están listas para el diseño están etiquetadas [Diseño necesario](https://github.com/metabase/metabase/labels/.Design%20Needed). Una vez que una característica ha tenido un diseño visual razonablemente completo, debe etiquetarse. [Se necesita ayuda](https://github.com/metabase/metabase/labels/.Help%20Wanted).

### D) Crear la función

Una vez que se etiqueta una característica [Se necesita ayuda](https://github.com/metabase/metabase/labels/.Help%20Wanted), se considera listo para ser construido. Un miembro del equipo central (o usted, la persona increíblemente útil que usted es) puede comenzar a trabajar en ello.

Si está creando algo que los usuarios verán en la metabase, consulte el [Guía de estilo](https://localhost:3000/\_internal) mientras se ejecuta el entorno de desarrollo para aprender cómo y cuándo usar varios elementos de la interfaz de usuario de la metabase.

Una vez que una o más personas han comenzado a trabajar en una característica, debe marcarse [En curso](https://github.com/metabase/metabase/labels/.In%20Progress). Una vez que hay una rama + algún código, se abre una solicitud de extracción, vinculada a la función + cualquier problema que se haya reunido para informar a la función.

### E) Verificación y fusión

Todos los RP que impliquen más que un cambio insignificante deben ser revisados. Vea nuestro [Proceso de revisión de código](code-reviews.md).

Si todo va bien, la función se codifica, se verifica y luego se fusiona la solicitud de extracción. Cinco altos por todas partes.

Si faltan pruebas, problemas de estilo de código o problemas arquitectónicos específicos en la solicitud de extracción, deben solucionarse antes de fusionarse. Tenemos un listón muy alto tanto en el código como en la calidad del producto y es importante que esto se mantenga en el futuro, así que tenga paciencia con nosotros aquí.

## Formas de ayudar

El punto de partida sería familiarizarse con Metabase el producto, y conocer su camino. Si lo estás usando en el trabajo, ¡eso es genial! Si no [descargar Metabase](https://www.metabase.com/start/oss/) y jugar con él. Lea los documentos y, en general, tenga una idea del flujo del producto.

Aquí hay algunas formas en que puede ayudar, con el fin de aumentar la coordinación + interacción con nosotros:

### Ayuda para identificar necesidades y problemas que Metabase puede resolver

Si quieres ayudar, prueba Metabase. Úselo en su empresa e informe las cosas que le gustan, no le gustan y cualquier problema con el que se encuentre. Ayúdenos a comprender su modelo de datos, las métricas requeridas y los patrones de uso comunes tanto como pueda. Esta información afecta directamente a la calidad del producto. Cuanto más nos cuente sobre los tipos de problemas a los que se enfrenta, mejor podremos abordarlos.

### Ayúdanos a clasificar y apoyar a otros usuarios

Dedique tiempo a discourse.metabase.com y a los nuevos problemas e intente reproducir los errores informados. Para las personas que tienen problemas con sus bases de datos donde tiene un conocimiento significativo, ayúdelos. Quién sabe, tal vez terminen ayudándote con algo en el futuro.

Es útil si entiendes nuestro [marco de priorización](https://github.com/metabase/metabase/wiki/Bug-Prioritization) al responder.

### Cuéntale a tus amigos

Informa a tus amigos sobre Metabase. Inicie un grupo de usuarios en su área. [Tuitea sobre nosotros](http://twitter.com/metabase). Bloguea sobre cómo usas Metabase y comparte lo que has aprendido.

### Corregir errores

Según nuestra definición, los "errores" son situaciones en las que el programa no hace lo que se esperaba de acuerdo con el diseño o la especificación. Por lo general, estos se aplican a problemas en los que hay un comportamiento correcto claramente definido. Por lo general, es seguro tomar uno de estos, arreglarlo y enviar un PR (¡con pruebas!). Estos se fusionarán sin demasiado drama a menos que las relaciones públicas toquen mucho código. No se ofenda si le pedimos que haga pequeñas modificaciones o agregue más pruebas. Somos un poco TOC en la cobertura del código y el estilo de codificación.

### Ayuda con la documentación

Hay muchos documentos. A menudo tenemos dificultades para mantenerlos actualizados. Si los está leyendo y nota inconsistencias, errores o información desactualizada, ¡ayúdelos a mantenerlos actualizados!

### Trabajando en las características

Algunas características, por ejemplo, los controladores de base de datos, no tienen píxeles orientados al usuario. Estos son un gran lugar para comenzar a contribuir, ya que no requieren tanta comunicación, discusiones sobre compensaciones y procesos en general.

En situaciones en las que ya se ha hecho un diseño, siempre podemos usar algo de ayuda. Intervenga en una solicitud de extracción o un problema y ofrézcase a ayudar.

En términos generales, cualquier problema en [Se necesita ayuda](https://github.com/metabase/metabase/labels/.Help%20Wanted) es juego limpio.

### #YOLO SIMPLEMENTE ENVÍE UN PR

Si se te ocurre algo realmente genial y quieres compartirlo con nosotros, simplemente envía un PR. Si no ha pasado por el proceso anterior, probablemente no lo fusionaremos tal cual, pero si es convincente, estamos más que dispuestos a ayudarlo a través de la revisión del código, la revisión del diseño y, en general, la selección de TOC para que encaje en el resto de nuestra base de código.
