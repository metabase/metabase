# Running the Metabase JAR-file

To run the Metabase JAR-file you need to have Java Runtime Environment (JRE) installed on your system.

### Download Metabase

If you haven't done so already the first thing you need to do is [Download Metabase](https://metabase.com/start/jar.html). Simply save the JAR-file to a folder on your system where you wish to run Metabase.

### Verify Java is installed

As a quick check to see if your system already has Java installed and it's version details, try running this command from a terminal:

```
java -version
```

You should see output similar to this:

    openjdk version "11.0.7" 2020-04-14
    OpenJDK Runtime Environment AdoptOpenJDK (build 11.0.7+10)
    OpenJDK 64-Bit Server VM AdoptOpenJDK (build 11.0.7+10, mixed mode)

If you did not see such output, but instead saw either an error or the Java release date is more than a few months old, then you need to install or update Java.

It is recommended to use the latest LTS version of JRE from [AdoptOpenJDK](https://adoptopenjdk.net/releases.html) with HotSpot JVM and x64 architecture, but other [Java versions](./java-versions.md) are supported.

### Launching Metabase

Now that you have a working Java Runtime, you can now run the jar from a terminal with:

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
