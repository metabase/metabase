# Running the Metabase Jar File

To run the Metabase jar file you need to have Java installed on your system. Currently Metabase requires Java 8 or higher and will work on either the OpenJDK or Oracle JDK.

### Download Metabase

If you haven't done so already the first thing you need to do is [Download Metabase](http://www.metabase.com/start/jar.html).  Simply save the .jar file to a folder on your system where you wish to run Metabase.


### Verify Java is installed

Before you can launch the application you must verify that you have Java installed.  To check that you have a working java runtime, go to a terminal and type:

    java -version

You should see output such as:

    java version "1.8.0_31"
    Java(TM) SE Runtime Environment (build 1.8.0_31-b13)
    Java HotSpot(TM) 64-Bit Server VM (build 25.31-b07, mixed mode)

If you did not see the output above and instead saw either an error or your Java version is less than 1.7, then you need to install the Java Runtime.

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
