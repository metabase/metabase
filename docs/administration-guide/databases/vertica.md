## Working with Vertica in Metabase

Starting in v0.20.0, Metabase provides a driver for connecting to Vertica databases. Under the hood, Metabase uses Vertica's JDBC driver;
due to licensing restrictions, we can't include it as part of Metabase. Luckily, downloading it yourself and making it available to Metabase
is straightforward and only takes a few minutes.

### Downloading the Vertica JDBC Driver JAR

You can download the JDBC driver from [Vertica's JDBC driver downloads page](https://my.vertica.com/download/vertica/client-drivers/).
Head to this page, log in to your account, accept the license agreement, and download `vertica-jdbc-8.0.0-0.jar` (for Vertica DB version 8.0)
or whatever driver version most closely matches the version of Vertica you're running.

It's very important to make sure you use the correct version of the JDBC driver; version
8.0 of the driver won't work with Vertica version 7.2; version 7.2 of the driver won't work with Vertica version 7.1, and so forth. If in doubt,
consult Vertica's documentation to find the correct version of the JDBC driver for your version of Vertica.

### Adding the Vertica JDBC Driver JAR to the Metabase Plugins Directory

Metabase will automatically make the Vertica driver available if it finds the Vertica JDBC driver JAR in the Metabase plugins directory when it starts up.
All you need to do is create the directory, move the JAR you just downloaded into it, and restart Metabase.

By default, the plugins directory is called `plugins`, and lives in the same directory as the Metabase JAR.

For example, if you're running Metabase from a directory called `/app/`, you should move the Vertica JDBC driver JAR to `/app/plugins/`:

```bash
# example directory structure for running Metabase with Vertica support
/app/metabase.jar
/app/plugins/vertica-jdbc-8.0.0-0.jar
```

If you're running Metabase from the Mac App, the plugins directory defaults to `~/Library/Application Support/Metabase/Plugins/`:

```bash
# example directory structure for running Metabase Mac App with Vertica support
/Users/camsaul/Library/Application Support/Metabase/Plugins/vertica-jdbc-8.0.0-0.jar
```

If you are running the Docker image or you want to use another directory for plugins, you should then specify a custom plugins directory by setting the environment variable `MB_PLUGINS_DIR`.


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
