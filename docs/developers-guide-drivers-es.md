***

## título: Socios y conductores comunitarios

# Socios e impulsores de la comunidad

Además de nuestro [Controladores con soporte oficial](./administration-guide/01-managing-databases.md#officially-supported-databases), muchas personas crean y mantienen controladores para integraciones de bases de datos.

Tenemos dos tipos de controladores de terceros:

*   [Conductores asociados](#partner-drivers)
*   [Conductores comunitarios](#community-drivers)

## Cómo utilizar un controlador de terceros

### Autohospedado

Para utilizar un controlador de socio o comunidad en una metabase autohospedada:

1.  Descargue el archivo jar más reciente del repositorio del controlador (consulte la sección Versiones del repositorio para ver los archivos JAR).
2.  Copie el archivo JAR en el directorio de plugins de su directorio de metabase (el directorio donde ejecuta el JAR de metabase).

Puede cambiar la ubicación del directorio de plugins configurando la variable de entorno `MB_PLUGINS_DIR`.

### Nube de metabase

Los controladores asociados, al igual que los controladores oficialmente compatibles, están disponibles de forma inmediata en la nube de Metabase. No es necesario tomar ninguna medida.

Los controladores de comunidad no son compatibles con Metabase Cloud.

## Conductores asociados

Los controladores de partners están disponibles tanto en Metabase Cloud como en Metabases autohospedadas.

Para calificar como conductor asociado, el conductor debe:

*   Tenga un patrocinador (generalmente el proveedor de la base de datos) que se haya comprometido a mantener el controlador para futuras versiones.
*   Pase el conjunto de pruebas de Metabase y una revisión del código por parte de nuestro equipo.
*   Tener una licencia permisiva.

Conductores asociados actuales:

*   [Firebolt](https://github.com/firebolt-db/metabase-firebolt-driver)
*   [Starburst (compatible con Trino)](https://github.com/starburstdata/metabase-driver)

Los controladores de socios están disponibles para los clientes de Cloud listos para usar.

Si tiene interés en convertirse en socio, complete el [formulario de socio](https://www.metabase.com/partners/join/) y nos pondremos en contacto.

## Conductores comunitarios

> Nota: Metabase Cloud no admite controladores de comunidad

Cualquiera puede construir un conductor comunitario. Estos son los controladores de base de datos de terceros actualmente conocidos para Metabase.

Instale estos controladores bajo su propio riesgo. Los plugins se ejecutarán como parte de su instancia de Metabase y, como tal, tendrán acceso a cualquier cosa que haga.

| | de base de datos | de estrellas de GitHub Última versión (*si está disponible*)                                                                                                 |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Atenea amazónica](https://github.com/dacort/metabase-athena-driver)                       | ![GitHub stars](https://img.shields.io/github/stars/dacort/metabase-athena-driver)                    | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/dacort/metabase-athena-driver)                    |
| [ClickHouse](https://github.com/enqueue/metabase-clickhouse-driver)                     | ![GitHub stars](https://img.shields.io/github/stars/enqueue/metabase-clickhouse-driver)               | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/enqueue/metabase-clickhouse-driver)               |
| [CSV (csv)](https://github.com/Markenson/csv-metabase-driver)                                 | ![GitHub stars](https://img.shields.io/github/stars/Markenson/csv-metabase-driver)                    | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/Markenson/csv-metabase-driver)                    |
| [Cubo.js](https://github.com/lili-data/metabase-cubejs-driver)                          | ![GitHub stars](https://img.shields.io/github/stars/lili-data/metabase-cubejs-driver)                 | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/lili-data/metabase-cubejs-driver)                 |
| [Datomic](https://github.com/lambdaisland/metabase-datomic)                             | ![GitHub stars](https://img.shields.io/github/stars/lambdaisland/metabase-datomic)                    |                                                                                                                               |
| [ABW](https://github.com/dludwig-jrt/metabase-db2-driver)                               | ![GitHub stars](https://img.shields.io/github/stars/dludwig-jrt/metabase-db2-driver)                  |                                                                                                                               |
| [Exasol](https://github.com/exasol/metabase-driver)                                     | ![GitHub stars](https://img.shields.io/github/stars/exasol/metabase-driver)                           | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/exasol/metabase-driver)                           |
| [Firebird](https://github.com/evosec/metabase-firebird-driver)                          | ![GitHub stars](https://img.shields.io/github/stars/evosec/metabase-firebird-driver)                  | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/evosec/metabase-firebird-driver)                  |
| [Impala](https://github.com/brenoae/metabase-impala-driver)                             | ![GitHub stars](https://img.shields.io/github/stars/brenoae/metabase-impala-driver)                   | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/brenoae/metabase-impala-driver)                   |
| [Materializar](https://github.com/MaterializeInc/metabase-materialize-driver)            | ![GitHub stars](https://img.shields.io/github/stars/MaterializeInc/metabase-materialize-driver)       | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/MaterializeInc/metabase-materialize-driver)       |
| [Neo4j](https://github.com/bbenzikry/metabase-neo4j-driver)                             | ![GitHub stars](https://img.shields.io/github/stars/bbenzikry/metabase-neo4j-driver)                  | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/bbenzikry/metabase-neo4j-driver)                  |
| [Spark Databricks](https://github.com/fhsgoncalves/metabase-sparksql-databricks-driver) | ![GitHub stars](https://img.shields.io/github/stars/fhsgoncalves/metabase-sparksql-databricks-driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/fhsgoncalves/metabase-sparksql-databricks-driver) |
| [Teradata](https://github.com/swisscom-bigdata/metabase-teradata-driver)                | ![GitHub stars](https://img.shields.io/github/stars/swisscom-bigdata/metabase-teradata-driver)        | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/swisscom-bigdata/metabase-teradata-driver)        |

Si no ve un controlador para su base de datos, intente buscar en los comentarios del [Problema relacionado con la base de datos](https://github.com/metabase/metabase/labels/Database%2F). También puede encontrar más por [buscar en GitHub](https://github.com/search?q=metabase+driver).

Si tiene problemas para instalar o usar un controlador de la comunidad, su mejor opción es ponerse en contacto con el autor del controlador.

[Nube de metabase](https://www.metabase.com/start/) no es compatible con los controladores de la comunidad, lo que significa que (por ahora) solo puede usar Metabase Cloud con el [controladores admitidos oficialmente](./administration-guide/01-managing-databases.md#officially-supported-databases)y los controladores asociados enumerados anteriormente.

## Escribe tu propio controlador

Check-out [Guía para escribir un controlador de metabase](./developers-guide/drivers/start.md).
