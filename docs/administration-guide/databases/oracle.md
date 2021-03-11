## Working with Oracle in Metabase

Starting in v0.20.0, Metabase provides a driver for connecting to Oracle databases. Under the hood, Metabase uses Oracle's JDBC driver; due to licensing restrictions, we can't
include it as part of Metabase. Luckily, downloading it yourself and making it available to Metabase is straightforward and only takes a few minutes.

### Downloading the Oracle JDBC Driver JAR

You can download the JDBC driver from [Oracle's JDBC driver downloads page](https://www.oracle.com/technetwork/database/application-development/jdbc/downloads/index.html).
Head to this page, accept the license agreement, and download `ojdbc8.jar`:

![Oracle JDBC Download](../images/oracle_jdbc_download.png)

Before downloading this JAR you may need to sign up for a free account with Oracle. We have had success with the latest version at the time of this writing, 19.3 (even with older Oracle 12c databases), but any version _should_ work.

### Adding the Oracle JDBC Driver JAR to the Metabase Plugins Directory

Metabase will automatically make the Oracle driver available if it finds the Oracle JDBC driver JAR in the Metabase plugins directory when it starts up.
All you need to do is create the directory, move the JAR you just downloaded into it, and restart Metabase.

### Connecting with SSL

To connect to Oracle via SSL and enable encryption, check the `Use a secure connection (SSL)?` option on the connection
setup page.  You can add other SSL features (including client and/or server authentication) as explained below. You can
use both client and server authentication (known as mutual authentication).

#### Server authentication

To configure the client (Metabase) to authenticate the identity of the server (the Oracle server), you may need to
configure a truststore file that includes the server's root CA, so that the JVM running Metabase trusts its
certificate chain. Refer to the
[Oracle documentation](https://docs.oracle.com/javase/8/docs/technotes/tools/unix/keytool.html) on using `keytool` to
manage key and truststore files, importing certificates, etc. Once you have a truststore file ready, add the
following JVM options for Metabase:

```
-Djavax.net.ssl.trustStore=/path/to/truststore.jks
-Djavax.net.ssl.trustStoreType=JKS \
-Djavax.net.ssl.trustStorePassword=<trustStorePassword>
```

With this done, the SSL connection to Oracle will authenticate the server.

For more information on setting up a truststore for AWS RDS Oracle instances, see the
[instructions provided by Amazon](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.Oracle.Options.SSL.html#Appendix.Oracle.Options.SSL.JDBC).
Note that if you require connecting to other databases using SSL, instead of creating a new truststore, as shown in
those examples, you'll probably want to add the RDS CA to your existing truststore file (likely called `cacerts`),

#### Client authentication

To configure the server (the Oracle server) to authenticate the identity of the client (Metabase), you need to
configure a keystore file that includes the client's private key. The steps are almost identical to those
above, except that you will import the client's private key into the keystore rather than a root CA into a truststore
file.

```
-Djavax.net.ssl.keyStore=/path/to/keystore.jks
-Djavax.net.ssl.keyStoreType=JKS \
-Djavax.net.ssl.keyStorePassword=<keyStorePassword>
```

With this done, the Oracle server will authenticate Metabase using the private key when Metabase tries to connect over
SSL.

#### When running from a JAR

By default, the plugins directory is called `plugins`, and lives in the same directory as the Metabase JAR.

For example, if you're running Metabase from a directory called `/app/`, you should move the Oracle JDBC driver JAR to `/app/plugins/`:

```bash
# example directory structure for running Metabase with Oracle support
/app/metabase.jar
/app/plugins/ojdbc8.jar
```

#### When running the Mac App

If you're running Metabase from the Mac App, the plugins directory defaults to `~/Library/Application Support/Metabase/Plugins/`:

```bash
# example directory structure for running Metabase Mac App with Oracle support
/Users/camsaul/Library/Application Support/Metabase/Plugins/ojdbc8.jar
```

Finally, you can choose a custom plugins directory if the default doesn't suit your needs by setting the environment variable `MB_PLUGINS_DIR`.

#### When running from Docker

The process for adding plugins when running via Docker is similar, but you'll need to mount the `plugins` directory. Refer to instructions [here](../../operations-guide/running-metabase-on-docker.html#adding-external-dependencies-or-plugins) for more details.
