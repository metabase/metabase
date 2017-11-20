## Working with Teradata in Metabase

Starting in v0.26.x, Metabase provides a driver for connecting to Teradata databases. Under the hood, Metabase uses Teradata's JDBC driver; due to licensing restrictions, we can't
include it as part of Metabase. Luckily, downloading it yourself and making it available to Metabase is straightforward and only takes a few minutes.

### Downloading the required Teradata JARs

You can download the JDBC driver from [Teradata's JDBC driver downloads page](https://downloads.teradata.com/download/connectivity/jdbc-driver).

Before downloading this JAR you have to sign up for a free account with Teradata.


### Adding the Teradata JDBC Driver JARs to the Metabase Plugins Directory

Metabase will automatically make the Teradata driver available if it finds the Teradata JDBC driver JARs in the Metabase plugins directory when it starts up.
By default, the plugins directory is called `plugins`, and lives in the same directory as the Metabase JAR.
Move the downloaded files terajdbc4.jar and tdgssconfig.jar into that directory and Metabase will pick it up.

```bash
# example directory structure for running Metabase with Teradata support
├── metabase.jar
└── plugins
    ├── tdgssconfig.jar
    └── terajdbc4.jar
```

If you're running Metabase from the Mac App, the plugins directory defaults to `~/Library/Application Support/Metabase/Plugins/`:

```bash
# example directory structure for running Metabase Mac App with Teradata support
$HOME/Library/Application Support/Metabase/Plugins/tdgssconfig.jar
$HOME/Library/Application Support/Metabase/Plugins/terajdbc4.jar
```

Finally, you can choose a custom plugins directory if the default doesn't suit your needs by setting the environment variable `MB_PLUGINS_DIR`.


### Enabling Plugins on Java 9

Java 9 disables dynamically adding JARs to the Java classpath by default for security reasons. When using Java 9, you'll need to pass an extra JVM option:

```bash
java --add-opens=java.base/java.net=ALL-UNNAMED -jar metabase.jar
```

The default Docker images already include this option.
