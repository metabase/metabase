***

## título: Working with Vertica in Metabase

# Trabajar con Vertica en Metabase

A partir de la versión 0.20.0, Metabase proporciona un controlador para conectarse a bases de datos de Vertica. Bajo el capó, Metabase utiliza el controlador JDBC de Vertica;
debido a restricciones de licencia, no podemos incluirlo como parte de Metabase. Por suerte, descárguelo usted mismo y ponerlo a disposición de Metabase
es sencillo y solo toma unos minutos.

## Descarga del JAR del controlador JDBC de Vertica

Puede descargar el controlador JDBC desde [Página de descargas de controladores JDBC de Vertica](https://my.vertica.com/download/vertica/client-drivers/).
Dirígete a esta página, inicia sesión en tu cuenta, acepta el acuerdo de licencia y descarga `vertica-jdbc-8.0.0-0.jar` (para Vertica DB versión 8.0)
o cualquier versión del controlador que más se acerque a la versión de Vertica que esté ejecutando.

Es muy importante asegurarse de utilizar la versión correcta del controlador JDBC; Versión
8.0 del controlador no funcionará con vertica versión 7.2; la versión 7.2 del controlador no funcionará con la versión 7.1 de Vertica, y así sucesivamente. En caso de duda,
consulte la documentación de Vertica para encontrar la versión correcta del controlador JDBC para su versión de Vertica.

## Adición del JAR del controlador JDBC de Vertica al directorio de complementos de metabase

Metabase hará que el controlador de Vertica esté disponible automáticamente si encuentra el JAR del controlador JDBC de Vertica en el directorio de complementos de Metabase cuando se inicie.
Todo lo que necesita hacer es crear el directorio, mover el JAR que acaba de descargar en él y reiniciar la Metabase.

### Al correr desde un JAR

De forma predeterminada, el directorio de plugins se llama `plugins`, y vive en el mismo directorio que el JAR de la metabase.

Por ejemplo, si está ejecutando Metabase desde un directorio llamado `/app/`, debe mover el JAR del controlador JDBC de Vertica a `/app/plugins/`:

```bash
# example directory structure for running Metabase with Vertica support
/app/metabase.jar
/app/plugins/vertica-jdbc-8.0.0-0.jar
```

### Al ejecutar desde Docker

El proceso para agregar complementos cuando se ejecuta a través de Docker es similar, pero deberá montar el `plugins` directorio. Consulte las instrucciones [aquí](../../operations-guide/running-metabase-on-docker.html#adding-external-dependencies-or-plugins) para más detalles.
