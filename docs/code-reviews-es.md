***

## título: "Revisiones de código"

# Revisiones de código

El objetivo general de una revisión de código es servir como una red de seguridad para otras personas de nuestro equipo y ayudarlos a escribir un mejor código, no para juzgarlos a ellos o a su código. En caso de duda, asuma que tienen buenas intenciones y SEA AMABLE.

## Metas

*   Detectar errores
*   Detecte las consecuencias no obvias de un enfoque: ¿este PR hará que el código futuro sea más difícil de asegurar o más defectuoso?
*   Para situaciones en las que las cosas se codificaron sin ser discutidas, una revisión del código sirve como una verificación de cordura para asegurarse de que se está tomando un enfoque correcto.
*   Señale las implicaciones del PR para partes de la Metabase que un PR no toca
*   Señale los lugares donde se utilizó un buen enfoque o estilo. Las revisiones de código no son un festival de odio. A menos que un PR sea completamente horrible, debería haber un número igual de puntos buenos y malos mencionados.

## Mentalidad dando una revisión de código

Su objetivo principal como revisor es servir como una red de seguridad y evitar que el código incorrecto se fusione. La definición de "malo" es altamente subjetiva, dependiente del contexto y cambiará con el tiempo y la madurez del producto.

Cuando encuentre errores claros, tómese el tiempo para anotar por qué cree que son errores.

Si ves lugares donde no estás de acuerdo con un enfoque, habla. Sin embargo, también tómese el tiempo para entender por qué el autor tomó una cierta decisión. Debes asumir que el autor tomó una buena decisión basada en lo que supo en el momento. Probablemente tenga un conjunto diferente de conocimientos y vea diferentes resultados. Profundice en estos. Es posible que vean cosas que tú no ves y viceversa.

Busca trucos, técnicas o modismos que puedas robar. Tus compañeros de equipo son personas inteligentes. Lo más probable es que tengan trucos de los que puedas aprender. Haga un punto de hacerles saber.

## Mindset obtener una revisión de código

El revisor te está haciendo un Sólido. Están ahí para ayudarte a hacer el mejor trabajo que puedas. Lo mejor de lo mejor tiene entrenadores, editores y mentores. Sus revisores de código deben ayudarlo de la misma manera. En situaciones en las que tienen más experiencia, esto puede ser una tutoría directa. En situaciones en las que son más jóvenes, tienen un nuevo par de ojos que podrían hacer que cuestiones suposiciones profundamente arraigadas.

Cuando un revisor no está de acuerdo con un enfoque que usted tomó, trate de entender por qué. Es posible que sepan cosas o vean consecuencias que tú no hiciste. Si bien es posible que no hayan pensado tan profundamente sobre el tema específico de las relaciones públicas como usted, también es probable que estén pensando en los impactos de las relaciones públicas en áreas a las que podría no estar prestando atención.

Si alguien le da una bofetada fuerte :-1: en su PR, sea especialmente paciente. Profundice en por qué piensan que las relaciones públicas son defectuosas. Aborde la conversación con la intención de mejorar las relaciones públicas, no de defender su enfoque. No obtienes puntos por ser un mejor debatiente, pero sí obtienes puntos por enviar un mejor código y un mejor producto, sin importar de dónde provenga la inspiración o las ideas.

## Proceso

*   Cada PR de complejidad significativa debe ser :+1:'d por al menos otro ingeniero en el equipo (o @salsakran) para fusionarse
*   Agregue personas que cree que deberían revisar su PR a los asignados de PR. El revisor puede eliminarse a sí mismo una vez que lo haya revisado o haya decidido que no es un revisor apropiado.
*   El código que afecta el trabajo de otros ingenieros debe ser revisado por esos ingenieros.
*   A :+1: es el valor predeterminado "Estoy de acuerdo con esto"
*   A :+0: (Lo inventé) es "No estoy encantado con esto, pero otras personas que dicen "+1" significa que se puede fusionar
*   R :-1: es un veto duro. Esto debe usarse con moderación en las relaciones públicas de ejecución del molino, y solo para cosas a las que les faltan pruebas, violaciones flagrantes de una guía de estilo o rompen suposiciones de las que depende otra parte de la base de código.
*   Si corta una rama importante sin discutir el diseño, o hablar sobre las implicaciones con otros ingenieros cuyo trabajo podría verse afectado, debe esperar un :-1:, y no estar obsesionado con la reelaboración de secciones controvertidas.
*   Cualquier PR que tenga un :-1: NO se puede fusionar hasta que se resuelva.
*   El propietario del PR y la persona que lanza un :-1: deben resolver las diferencias de enfoque.
*   Si hay un impasse, @salsakran emite un voto de desempate. Los impasses deben ser raros.

Tenga en cuenta que estos :+1:, :+0:, y :-1:'s deben indicarse explícitamente en un comentario, y no una reacción sobre la descripción principal del PR en github. Un cambio de :-1: a :+1: también debe indicarse explícitamente en un comentario.

## Cronometraje

*   Los RP para cuestiones de alta prioridad deben revisarse en el código tan pronto como estén disponibles.
*   Las relaciones públicas para problemas en un hito pueden esperar unos días.
*   Si no hay :+1:'s en un PR, es responsabilidad del creador de PR hacer un seguimiento con otros y revisar su código. Para volver a iterar, un PR debe ser :+1:'d para ser fusionado, y si no se ha revisado, está en el abridor del PR para redondear a un revisor.
*   Si hay una :-1: + no hay una resolución clara, tanto el creador del PR como el :-1: el votante debe planear pasar una hora durante el próximo día o dos para discutir el problema y planificar cómo resolverlo.
*   En el caso de que no haya movimiento en un PR con un :-1: después de una semana, @salsakran intervendrá.
