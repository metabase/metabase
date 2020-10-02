# Running the Metabase JAR file

To run Metabase via a JAR file, you will need to have a Java Runtime Environment (JRE) installed on your system.

### Install Java JRE

We recommend the latest LTS version of JRE from [AdoptOpenJDK](https://adoptopenjdk.net/releases.html) with HotSpot JVM and x64 architecture, but other [Java versions](./java-versions.md) are supported too.

### Download Metabase

Go to the [Metabase download page](https://metabase.com/start/jar.html) and download the latest release. Place the downloaded JAR file into a newly created directory (as it will create some files when it is run).

### Launching Metabase

Now that you have Java working you can run the JAR from a terminal with:

    java -jar metabase.jar

It's that simple. This will start the Metabase application using all of the default settings. You should see some log entries starting to run in your terminal window showing you the application progress as it starts up. Once Metabase is fully started you'll see a confirmation such as:

    ...
    06-19 10:29:34 INFO metabase.task :: Initializing task CheckForNewVersions
    06-19 10:29:34 INFO metabase.task :: Initializing task SendAnonymousUsageStats
    06-19 10:29:34 INFO metabase.task :: Initializing task SendAbandomentEmails
    06-19 10:29:34 INFO metabase.task :: Initializing task SendPulses
    06-19 10:29:34 INFO metabase.task :: Initializing task SendFollowUpEmails
    06-19 10:29:34 INFO metabase.task :: Initializing task TaskHistoryCleanup
    06-19 10:29:34 INFO metabase.core :: Metabase Initialization COMPLETE

At this point you're ready to go! You can access your new Metabase server on port 3000, most likely at [http://localhost:3000](http://localhost:3000)

You can use another port than 3000 by setting the `MB_JETTY_PORT` environment variable before running the jar.

Note that in the default configuration Metabase will use a local H2 database for storing all its own application data. This is meant for simple evaluations or personal use, so if you want to run Metabase in production we recommend you [migrate away from H2](./migrating-from-h2.md).

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).
