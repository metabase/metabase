## Working with SparkSQL in Metabase

Starting in v0.29.0, Metabase provides a driver for connecting to SparkSQL databases. Under the hood, Metabase uses SparkSQL's
JDBC driver and other dependencies; due to the sheer size of this dependency, we can't include it as part of Metabase. Luckily, downloading it yourself
 and making it available to Metabase is straightforward and only takes a few minutes.

### Downloading the SparkSQL JDBC Driver JAR

You can download the required dependencies [here](https://s3.amazonaws.com/sparksql-deps/metabase-sparksql-deps-1.2.1.spark2-standalone.jar).

### Adding the SparkSQL JDBC Driver JAR to the Metabase Plugins Directory

Metabase will automatically make the SparkSQL driver available if it finds the SparkSQL dependencies JAR in the Metabase plugins
directory when it starts up. All you need to do is create the directory, move the JAR you just downloaded into it, and restart
Metabase.

By default, the plugins directory is called `plugins`, and lives in the same directory as the Metabase JAR.

For example, if you're running Metabase from a directory called `/app/`, you should move the SparkSQL dependencies JAR to
`/app/plugins/`:

```bash
# example directory structure for running Metabase with SparkSQL support
/app/metabase.jar
/app/plugins/metabase-sparksql-deps-1.2.1.spark2-standalone.jar
```

If you're running Metabase from the Mac App, the plugins directory defaults to `~/Library/Application Support/Metabase/Plugins/`:

```bash
# example directory structure for running Metabase Mac App with SparkSQL support
/Users/camsaul/Library/Application Support/Metabase/Plugins/metabase-sparksql-deps-1.2.1.spark2-standalone.jar
```

Finally, you can choose a custom plugins directory if the default doesn't suit your needs by setting the environment variable
`MB_PLUGINS_DIR`.


### Enabling Plugins on Java 9

Java 9 disables dynamically adding JARs to the Java classpath by default for security reasons. For the time being, we recommend you
run Metabase with Java 8 when using the SparkSQL driver.

You may be able to get Java 9 to work by passing an extra JVM option:

```bash
java --add-opens=java.base/java.net=ALL-UNNAMED -jar metabase.jar
```

The default Docker images already include this option.
