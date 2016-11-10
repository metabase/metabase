## Working with Impala in Metabase

Metabase provides a driver for connecting to Impala databases. Under the hood, Metabase uses Impala's JDBC driver; due to licensing restrictions, we can't
include it as part of Metabase. Luckily, downloading it yourself and making it available to Metabase is straightforward and only takes a few minutes.

### Downloading the Impala JDBC Driver

You can download the JDBC driver from [Impala's JDBC driver downloads page](http://www.cloudera.com/downloads/connectors/impala/jdbc.html).
The downloaded archive files contains ImpalaJDBC41_[Version].zip



### Adding the Impala JDBC Driver JAR's to the Metabase Plugins Directory

See the [Impala's JDBC driver instalaltion guide](http://www.cloudera.com/content/www/en-us/documentation/other/connectors/impala-jdbc/latest/Cloudera-JDBC-Driver-for-Impala-Install-Guide.pdf) for a detailed description of the package contents.

Metabase will automatically make the Impala driver available if it finds the Impala JDBC driver and JAR in the Metabase plugins directory when it starts up.
All you need to do is create the directory and extract the files from ImpalaJDBC41_[Version].zip into it.

By default, the plugins directory is called `plugins`, and lives in the same directory as the Metabase JAR.

For example, if you're running Metabase from a directory called `/app/`, you should move the Impala JDBC driver JAR to `/app/plugins/`:

```bash
# example directory structure for running Metabase with Impala support
/app/metabase.jar
/app/plugins/commons-codec-1.3.jar
/app/plugins/commons-logging-1.1.1.jar
/app/plugins/hive_metastore.jar
/app/plugins/hive_service.jar
/app/plugins/httpclient-4.1.3.jar
/app/plugins/httpcore-4.1.3.jar
/app/plugins/ImpalaJDBC41.jar
/app/plugins/libfb303-0.9.0.jar
/app/plugins/libthrift-0.9.0.jar
/app/plugins/log4j-1.2.14.jar
/app/plugins/ql.jar
/app/plugins/slf4j-api-1.5.11.jar
/app/plugins/lf4j-log4j12-1.5.11.jar
/app/plugins/TCLIServiceClient.jar
/app/plugins/zookeeper-3.4.6.jar
```

If you're running Metabase from the Mac App, the plugins directory defaults to `~/Library/Application Support/Metabase/Plugins/`:

```bash
# example directory structure for running Metabase Mac App with Impala support
/Users/camsaul/Library/Application Support/Metabase/Plugins/ImpalaJDBC41.jar
```

Finally, you can choose a custom plugins directory if the default doesn't suit your needs by setting the environment variable `MB_PLUGINS_DIR`.

### Authentication mechanism

The Impala JDBC driver support 4 different authentication mechanisms. 
```
No Authentication
Kerberos
User Name
User Name And Password
```
The preferred mechanism can be selected using the AuthMech parameter. 

### Configuring Kerberos

Configuring the Impala driver to use Kerberos requires the following steps:

1. Install Kerberos client OS packages on the server where you have installed Metabase.
2. Configure the correct Kerberos settings (krb5.conf), see the following example:

```
[libdefaults]
default_realm = MYREALM
dns_lookup_kdc = false
dns_lookup_realm = false
ticket_lifetime = 86400
renew_lifetime = 604800
forwardable = true
default_tgs_enctypes = aes256-cts aes128-cts des3-hmac-sha1 arcfour-hmac des-hmac-sha1 des-cbc-md5 des-cbc-crc
default_tkt_enctypes = aes256-cts aes128-cts des3-hmac-sha1 arcfour-hmac des-hmac-sha1 des-cbc-md5 des-cbc-crc
permitted_enctypes = aes256-cts aes128-cts des3-hmac-sha1 arcfour-hmac des-hmac-sha1 des-cbc-md5 des-cbc-crc
udp_preference_limit = 1
default_realm = MYREALM

[realms]
MYREALM = {
kdc = kdc.example.com
admin_server = admin.example.com
}
```

3. Create a keytab file
A keytab is a file that contains usernames and encrypted passwords, the Impala JDC driver uses the keytab to authenticate with the Impala service. Create a keytab file with the ktutil utility.
```
ktutil
ktutil: addent -password -p username@MYREALM -k 1 -e aes256-cts
wkt my_keytab
```

4. Create a JAAS file
A JAAS (Java Authentication and Authorization Service), is used to configure how Java should authenticate with Kerberos. See the following example.
```
Client {
    com.sun.security.auth.module.Krb5LoginModule required
        useKeyTab=true
        keyTab="/path/to/my_keytab"
        principal="username@MYREALM"
        doNotPrompt=true;
};
```

5. Enable Strong encryption for Java
Strong encryption is disabled by default when you install Java, to be able to use strong AES encryption the [Java Cryptography Extension (JCE) Unlimited Strength Jurisdiction Policy Files](http://www.oracle.com/technetwork/java/javase/downloads/jce8-download-2133166.html) need to be installed. Follow the installation instructions provided by Oracle.


6. Start Metabase using JAAS
Use an additional Java option which points to the location of the JAAS config file.
 
```
java -Djava.security.auth.login.config=jaas.conf -jar metabase.jar
```

7. In Metabase, create a new database by selecting the Impala driver. Enter the value 1 in the "Authentication mechanism" field and configure the "KrbRealm", "KrbHostFQDN" and "KrbServiceName" properties in the "Connection attributes" field. For example:

```
KrbRealm=MYREALM;KrbHostFQDN=impala-node.example.com;KrbServiceName=impala
```

When no Impala connection can be created, add the Kerberos debug options to the Metabase start options to get more detailed logging information.
```
java -Djava.security.auth.login.config=jaas.conf -Dsun.security.krb5.debug=true -Dsun.security.jgss.debug=true -jar metabase.jar
```

It is also possible to have the Impala JDBC driver produce more logging by adding the following properties to the "Connection attributes" field. For example:

```
LogLevel=6;LogPath=/path/to/logdir;
```

