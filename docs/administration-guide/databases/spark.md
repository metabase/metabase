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


### Adding Additional Dependencies with Java 9

Java version 9 has introduced a new module system that places some additional restrictions on class loading. To use
Metabase drivers that require extra external dependencies, you'll need to include them as part of the classpath at
launch time. Run Metabase as follows:

```bash
# Unix
java -cp metabase.jar:plugins/* metabase.core
```

On Windows, use a semicolon instead:

```powershell
# Windows
java -cp metabase.jar;plugins/* metabase.core
```

The default Docker images use Java 8 so this step is only needed when running the JAR directly.


### Using SparkSQL with a Custom Metabase Build

The SparkSQL dependencies JAR contains additional classes inside the `metabase` Java package, the same package
the core  Metabase code lives in. When multiple JARs include classes in the same package, Java requires them to
be signed with the same signing certificate. The official Metabase JAR and SparkSQL dependencies JAR are signed
with the same certificate, so everything works as expected.

If you build a custom Metabase JAR, however, Java will refuse to load the SparkSQL dependencies JAR provided
above, because your JAR will not be signed with the same certificate (if you signed it at all). You will need to
build the SparkSQL dependencies JAR yourself, and, if applicable, sign it with the same certificate you signed
your custom Metabase JAR with.

The SparkSQL dependencies project can be found at
[https://github.com/metabase/sparksql-deps](https://github.com/metabase/sparksql-deps). Instructions for building
the JAR are provided in the README.
