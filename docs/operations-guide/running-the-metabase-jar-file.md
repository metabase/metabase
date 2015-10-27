# Running the Metabase Jar File

To run the Metabase jar file you need to have Java installed on your system.  Currently Metabase requires Java 6 or higher and will work on either the OpenJDK or Oracle JDK.  Note that the Metabase team prefers to stick with open source solutions where possible, so we use the OpenJDK for our Metabase instances.

### Download Metabase

If you haven't done so already the first thing you need to do is [Download Metabase](http://www.metabase.com/start/jar.html).  Simply save the .jar file to a folder on your system where you wish to run Metabase.


### Verify Java is installed

Before you can launch the application you must verify that you have Java installed.  To check that you have a working java runtime, go to a terminal and type:

    java -version

You should see output such as:

    java version "1.60_65"
    Java (TM) SE Runtime Environment (build 1.6.0_65-b14-466.1-11M4716)
    Java HotSpot (TM) 64-Bit Server VM (build 20.65-b04-466.1, mixed mode)

If you did not see the output above and instead saw either an error or your Java version is less than 1.6, then you need to install the Java Runtime.

[OpenJDK Downloads](http://openjdk.java.net/install/)  
[Oracle's Java Downloads](http://www.oracle.com/technetwork/java/javase/downloads/index.html)


### Launching Metabase

Now that you have a working Java Runtime, you can now run the jar from a terminal with:

    java -jar metabase.jar

It's that simple.  This will start the Metabase application using all of the default settings.  You should see some log entries starting to run in your terminal window showing you the application progress as it starts up.  Once Metabase is fully started you'll see a confirmation such as:

    2015-10-14 22:17:50,960 [INFO ] metabase.core :: Metabase Initialization COMPLETE
    2015-10-14 22:17:51,004 [INFO ] metabase.core :: Launching Embedded Jetty Webserver with config:
    {:port 3000, :host "localhost"}
    2015-10-14 22:17:51,024 [INFO ] org.eclipse.jetty.server.Server :: jetty-9.2.z-SNAPSHOT
    2015-10-14 22:17:51,049 [INFO ] org.eclipse.jetty.server.ServerConnector :: Started ServerConnector@30aba609{HTTP/1.1}{localhost:3000}
    2015-10-14 22:17:51,050 [INFO ] org.eclipse.jetty.server.Server :: Started @35910ms

At this point your ready to go!  You can access your new Metabase server on port 3000, most likely at [localhost:3000](http://localhost:3000)

You can use another port than 3000 by setting the `MB_JETTY_PORT` environment variable before running the jar

Note that in the default configuration Metabase will use a local H2 database for storing all its own application data.  This is meant for simple evaluations or personal use, so if you want to run Metabase for a team we recommend you upgrade to a more robust SQL server such as Postgres.  See below for details on how to do that.

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).


### The Metabase Application Database

The application database is where Metabase stores information about users, saved questions, dashboards, and any other data needed to run the application.  The default settings use an H2 database, but other also Postgres is available.

#### [H2](http://www.h2database.com/) (default)
To use the H2 database for your Metabase instance you don't need to do anything at all.  When the application is first launched it will attempt to create a new H2 database in the same filesystem location the application is launched from.

You can see these database files from the terminal:

    ls metabase.*

You should see the following files:

    metabase.db.h2.db
    metabase.db.trace.db

If for any reason you want to use an H2 database file in a separate location from where you launch Metabase you can do so using an environment variable.  For example:

    export MB_DB_TYPE=h2
    export MB_DB_FILE=/the/path/to/my/h2.db
    java -jar metabase.jar

#### [Postgres](http://www.postgresql.org/)
For production installations of Metabase we recommend that users replace the H2 database with Postgres.  This offers a greater degree of performance and reliability when Metabase is running with many users.

You can change the application database to use Postgres using a few simple environment variables. For example:

    export MB_DB_TYPE=postgres
    export MB_DB_DBNAME=metabase
    export MB_DB_PORT=5432
    export MB_DB_USER=<username>
    export MB_DB_PASS=<password>
    export MB_DB_HOST=localhost
    java -jar metabase.jar

This will tell Metabase to look for its application database using the supplied Postgres connection information.

NOTE: you cannot change the application database while the application is running.  these values are read only once when the application starts up and will remain constant throughout the running of the application.

NOTE: currently Metabase does not support migrating data from one application database to another, so if you start with H2 and then want to move to Postgres you'll have to dump the data from H2 and import it into Postgres before relaunching the application.
