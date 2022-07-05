***

## título: Mapas personalizados

# Mapas personalizados

De forma predeterminada, Metabase utiliza OpenStreetMaps para visualizaciones de mapas, pero hay algunas opciones de personalización.

## Búsqueda de la configuración del mapa

Para encontrar la configuración del mapa:

1.  Haga clic en el botón **engranaje** en la parte inferior de la barra lateral de navegación y seleccione **Configuración de administración**.
2.  Escoger `Maps` desde la navegación de la izquierda.

![Map Settings](images/MapSettings.png)

## Mapear Tile Server

Como se mencionó anteriormente, Metabase utiliza el servidor de teselas OpenStreetMaps. Sin embargo, si su organización requiere un
aspecto o nivel de detalle en las visualizaciones de mapas, puede cambiar el servidor de iconos de mapas agregando el servidor de iconos de mapas
ruta al primer campo de la página. La ruta debe ser una URL que comience con "http://" o "https://" o un
ruta de acceso relativa a un archivo local en la ruta de clases de la JVM.

## Mapas de región personalizados

Si necesita un mapa que se centre en una región específica, es posible que desee cargar un mapa GeoJSON personalizado.

Para comenzar, haga clic en el botón `Add a map` botón. Aparecerá un modal, solicitando:

*   El nombre del mapa
*   La dirección URL del archivo GeoJSON
*   La propiedad JSON que metabase debe utilizar como identificador de la región (una forma distinta de identificar este mapa de región específico)
*   La propiedad JSON que metabase debe utilizar como nombre para mostrar (cómo aparece el nombre del mapa de región en la interfaz de usuario)

Si actualmente no tiene un archivo GeoJSON, hay muchas herramientas disponibles para crear uno, como
[MapShaper](https://mapshaper.org/) o [GeoJSON.io](http://geojson.io/). Si solo te interesa leer más sobre
GeoJSON, te recomendamos que comiences [aquí](https://geojson.org/).

***

## Siguiente: editar metadatos

Tomar solo unos minutos para editar y agregar información a los metadatos de su base de datos puede mejorar en gran medida su experiencia con
Metabase. Aprendamos a [editar los metadatos](03-metadata-editing.md).
