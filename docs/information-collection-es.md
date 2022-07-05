***

## título: Acerca de la información que recopilamos

# Acerca de la información que recopilamos

Metabase utiliza Google Analytics y Snowplow para recopilar información de uso anónima de los servidores instalados que habilitan esta función. A continuación se muestra una lista representativa de los eventos que hemos instrumentado, así como la información que recopilamos sobre el usuario que realiza la acción y la instancia que se está utilizando.

También llamaremos a casa algunas métricas anónimas del servidor de aplicaciones de la metabase todas las noches. Tenga en cuenta que no recopilamos ningún nombre de usuario, ningún correo electrónico, la IP del servidor, detalles de la base de datos de ningún tipo ni ninguna información de identificación personal en este proceso.

Si bien esta lista de información anónima que recopilamos puede parecer larga, es útil compararla con otras alternativas. Con una plataforma SaaS típica, no solo se recopilará esta información, sino que también irá acompañada de información sobre sus datos, con qué frecuencia se accede a ellos, las consultas específicas que utiliza, números específicos de registros, todo vinculado a su empresa y plan actual.

Recopilamos esta información para mejorar su experiencia y la calidad de Metabase. Utilizamos la información que comparte voluntariamente para comprender cómo nuestros usuarios están utilizando realmente nuestro producto, qué tipo de características priorizar y cuántos elementos orientar en nuestro proceso de diseño. Por ejemplo, sin saber cuál es la distribución del número de cuentas en cada instancia en nuestra base de instalación, no podemos saber si las herramientas que proporcionamos no pueden escalar hasta que alguien se queje. E incluso entonces, solo escuchamos quejas y no a las personas que nos usan felizmente en silencio. Nos esforzamos por crear el mejor producto posible.

Si prefiere no proporcionarnos estos datos de uso anónimos, siempre puede ir a la sección de administración de su instancia y desactivar la opción de `Anonymous Tracking`.

Si estás en el proceso de configurar tu Metabase, un administrador también puede desactivar el seguimiento durante el `Usage Data Preferences` paso de incorporación. Recopilamos algunos eventos anónimos antes de ese momento, pero ya no lo haremos si eliges optar por no participar.

En la siguiente lista, explicamos exactamente por qué recopilamos cada bit de información.

## Preguntas de ejemplo que queremos responder

*   ¿Funciona nuestra interfaz de consulta?
    *   ¿Los usuarios se detienen a mitad de camino de una pregunta?
    *   ¿Los usuarios usan filtros?
    *   ¿Los usuarios utilizan agrupaciones?
    *   ¿Con qué frecuencia usan los usuarios filas desnudas frente a otras opciones de agregación?
    *   ¿Las personas hacen clic en los encabezados de columna para ordenar o agregan manualmente una cláusula de ordenación?
*   ¿Con qué frecuencia escriben SQL los usuarios en lugar de usar la interfaz de consulta?
    *   ¿Estas consultas son escritas por un grupo selecto de analistas o toda la empresa está alfabetizada en SQL?
*   ¿Las personas utilizan los paneles como punto de partida para las consultas?
*   ¿Cuántos clics hay en las tarjetas del tablero?
*   ¿Cuántos de estos clics dan como resultado consultas modificadas que se ejecutan?
*   ¿Con qué frecuencia se guardan las preguntas?
*   ¿Con qué frecuencia se agregan preguntas guardadas a los paneles?

## Qué haremos con las respuestas a estas preguntas

*   Priorizar las mejoras en la interfaz de consulta frente a la interfaz SQL
*   Optimizar el producto para patrones de uso comunes
*   Manténgase al tanto de las incompatibilidades del navegador
*   Optimice nuestros paneles de control para el consumo pasivo o como punto de partida para una mayor exploración dependiendo de cómo se estén utilizando.

Si bien seguiremos de cerca los problemas reportados y las solicitudes de funciones, nuestro objetivo es hacer felices a la mayor cantidad de nuestros usuarios y proporcionarles mejoras en las funciones que les importan. Permitirnos recopilar información sobre su instancia le da a sus usuarios un voto en futuras mejoras de manera directa.

## Los datos que recopilamos

NOTA: Nunca capturamos ningún detalle específico en ninguna de nuestras metodologías de seguimiento, como detalles de usuario, nombres de tablas, nombres de campos, etc. Los datos recopilados se limitan a los tipos de acciones que los usuarios están realizando con el producto.

## Eventos de Google Analytics

| Categoría | | de acción ¿Por qué recopilamos esta |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enlaces y páginas vistas | Seguimiento general del sitio web de qué páginas son las más utilizadas | Esto proporciona una mejor comprensión de qué partes de la aplicación son apreciadas y utilizadas por los clientes para que sepamos qué es popular y potencialmente qué necesita más mejoras.                                                                            |
| Paneles | Cuando se utiliza el menú desplegable del panel, cuando se crean y actualizan los paneles, qué tipos de ediciones se producen, como agregar / eliminar tarjetas y reposicionamiento.                 | Utilizamos esta información para comprender cómo se utilizan los paneles y qué tipos de actividades realizan los usuarios con mayor frecuencia en sus paneles.                                                                                                          |
| Pulsos | Cuando se crean y actualizan pulsos, qué tipos de pulsos se crean y cuántas tarjetas suelen ir en un pulso.                                                       | Esto se utiliza para tener una idea de cómo los equipos están estructurando su comunicación basada en el empuje. Cuándo y dónde se envía la información con mayor frecuencia y cuánta información permite a Metabase continuar mejorando las características en torno a las interacciones de datos basadas en push. |
| | generador de consultas Cuando las preguntas se guardan y se ven junto con los tipos de opciones que se realizan, como los tipos de gráficos y las cláusulas de consulta utilizadas.                                                | Ayuda al equipo de la metabase a comprender los patrones básicos sobre cómo los usuarios acceden a sus datos.                                                                                                                                                      |
| | de consultas SQL Cuando se guarda o ejecuta una consulta SQL.                                                                                                                                        | Esto en su mayoría solo nos da una idea de cuándo los usuarios están omitiendo la interfaz de consulta de GUI. Nunca capturamos el SQL real escrito.                                                                                                                      |
| Configuración de administración | Capturamos algunas estadísticas muy básicas sobre cuándo se actualizan las configuraciones y si alguna vez hay errores. También capturamos configuraciones no intrusivas, como la zona horaria elegida.       | Utilizamos esta información para asegurarnos de que los usuarios no tengan problemas para administrar su instancia de Metabase y nos proporciona un poco de sentido para las opciones de configuración más comunes para que podamos optimizar para esos casos.                                   |
| Bases de datos | Simplemente capturamos cuándo se crean o eliminan las bases de datos y qué tipos de bases de datos se utilizan | Esto ayuda a Metabase a garantizar que dedicamos la mayor parte del tiempo y la atención a los tipos de bases de datos que son más populares para los usuarios.                                                                                                                        |
| | de modelos de datos El almacenamiento y las actualizaciones de tablas, campos, segmentos y métricas se cuentan, junto con algunos otros detalles, como qué tipos de opciones de metadatos especiales se realizan. | Utilizamos estos datos para ayudar a garantizar que Metabase proporcione un conjunto adecuado de opciones para que los usuarios describan sus datos y también nos da una idea de cuánto tiempo pasan los usuarios marcando sus esquemas.                                               |

## Eventos de quitanieves

| Categoría | | de acción ¿Por qué recopilamos esta |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Configurar | Seguimiento general de clics de qué pasos se completan frente a | abandonados Esto nos proporciona una mejor comprensión de cómo podemos mejorar la rampa de acceso para los nuevos usuarios de Metabase.                                      |
| Configuración de la base de datos | Si el intento de conexión a la base de datos es correcto o incorrecto, con qué base de datos se conecta. No recopilamos ninguna de sus credenciales de base de datos aquí. | Nos ayuda a comprender qué bases de datos son las más populares y funcionan como se esperaba para que podamos invertir en mejorar la forma en que Metabase funciona con ellas. |
| Panel de | Cuando crea un nuevo panel o agrega una nueva pregunta a un panel.                                                                                             | Podemos usar esto para determinar si Metabase está agregando valor a su organización y, por lo tanto, si estamos haciendo nuestro trabajo correctamente.             |
| | de cuenta Cuando se crea un nuevo usuario o se configura una nueva instancia.                                                                                                           | Esto potencia los informes básicos para ayudarnos a comprender cómo está creciendo su equipo de Metabase.                                                        |

## Análisis del lado del servidor

| | métrica Un ejemplo de por qué recopilamos esta |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Número de usuarios/administradores y si SSO está habilitado | Para comprender qué métodos de autenticación se están utilizando y si se deben priorizar las características que se escalan con el número de usuarios.                                    |
| Número de grupos de usuarios | Para comprender lo complicado que es un modelo de permisos que tienen la mayoría de nuestros usuarios y para asegurarnos de que no simplificamos demasiado nuestros diseños.                     |
| Número de paneles | Si necesitamos proporcionar formas de organizar los paneles.                                                                                                 |
| Número de tarjetas por panel | ¿Necesitamos proporcionar más estructura para que los paneles largos sean más fáciles de analizar?                                                                           |
| Número de paneles por | de tarjeta ¿Nuestros usuarios solo están creando una tarjeta para ponerla en un panel de control o se usan en muchos lugares?                                                            |
| Tipos de bases de datos | ¿Qué errores del controlador de base de datos priorizar |
| Número de pulsos con conexiones | ¿Las personas usan archivos adjuntos?                                                                                                                           |
| Número de alertas | ¿Las personas usan alertas? ¿Suelen tener unos pocos o cada usuario los tiene?                                                                      |
| Número de colecciones | ¿Necesitamos agregar herramientas de organización adicionales?                                                                                                        |
| Número de bases de datos | ¿Los usuarios utilizan una sola base de datos o muchas? ¿Qué tan grandes deben ser los iconos de una base de datos en el explorador de datos?                                                   |
| Número de | de esquema ¿Los usuarios utilizan activamente espacios de nombres en redshift? ¿Realmente necesitamos diseñar para 100 esquemas o es solo un pequeño porcentaje de nuestros usuarios?     |
| Número de tablas | ¿Qué tipo de modelos de datos utilizan las personas? ¿Necesitamos búsqueda de tablas?                                                                                     |
| Número de campos | ¿Podemos obtener previamente todos los campos de nuestra API de metadatos para mejorar el rendimiento de la mayoría de los usuarios, o deberíamos obtenerlos por tabla para escalar de manera más eficiente? |
| Número de segmentos | ¿Las personas están usando segmentos ampliamente? Si es así, ¿deberíamos mostrarlos más arriba en la interfaz de usuario?                                                                    |
| Número de métricas | ¿Son comunes las métricas? De lo contrario, ¿deberíamos eliminar la opción Métricas en el flujo de nuevas preguntas |
| Número de consultas ejecutadas | ¿Cuántas consultas ejecutan nuestras instancias más activas al día? ¿Necesitamos mejorar el almacenamiento en caché?                                                               |
| Número de errores de consulta | ¿Necesitamos cambiar la forma en que mostramos los errores en los registros? ¿Están siendo spameados?                                                                         |
| | de latencias de consulta ¿Qué porcentaje de nuestra base de usuarios ejecuta consultas que permiten consultas iterativas (menos de 1 segundo) |
| | de zona horaria Tenemos un error en una determinada zona horaria, ¿cuántos usuarios hay en esa zona horaria?                                                                               |
| | lingüística ¿Cuántos usuarios que no hablan inglés tenemos? ¿Qué tan rápido deberíamos impulsar la internacionalización?                                                     |
| | de la versión del sistema operativo y JVM ¿Podemos dejar de usar Java 7 todavía?                                                                                                                        |

Tenga en cuenta que esto está destinado a ser representativo. El código real que se está ejecutando para generar esto se puede auditar en [https://github.com/metabase/metabase/blob/master/src/metabase/analytics/](https://github.com/metabase/metabase/blob/master/src/metabase/analytics).

## Privacidad de datos

Echa un vistazo a nuestra página en [privacidad y seguridad de los datos](https://www.metabase.com/security).
