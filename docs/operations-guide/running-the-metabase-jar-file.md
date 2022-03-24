# Running the Metabase JAR file

To run Metabase via a JAR file, you will need to have a Java Runtime Environment (JRE) installed on your system.

- [Quick start](#quick-start)
- [Local installation](#local-installation)
- [Production installation](#production-installation)

## Quick start

> The quick start is intended just for running Metabase locally. See below for instructions on [running Metabase in production](#production-installation).

If you have Java installed, just

1. [Download Metabase](https://metabase.com/start/jar.html).

2. Create a new directory and move the JAR you downloaded into that new directory.

3. Change into that directory and run:

```
java --jar metabase.jar
```

4. Metabase will log its progress in the terminal as it starts up. Wait until you see "Metabase Initialization Complete" and visit [localhost:3000](http://localhost:3000/setup).

## Local installation

If you just want to try Metabase out, play around with Metabase, or just use Metabase on your local machine, Metabase ships with a default application database that you can use. **This setup is not meant for production**. If you intend to run Metabase for real at your organization, see [Production installation](#production-installation).

### 1. Install Java JRE

You may already have Java installed. To check the version, open a terminal and run:

```
java --version
```

If Java isn't installed, you'll need to install it before you can run Metabase. We recommend the latest LTS version of JRE from [Eclipse Temurin](https://adoptium.net/) with HotSpot JVM and x64 architecture, but other [Java versions](./java-versions.md) are supported too.

### 2. [Download Metabase](https://metabase.com/start/jar.html)

[Download the Metabase JAR](https://www.metabase.com/start/oss/jar.html).

### 3. Create a new directory and move the JAR into it.

When you run Metabase, Metabase will create some new files, so it's important to put the Metabase Jar file in a new directory before running it (so move it out of your downloads folder and put it a new directory).

On posix systems, the commands would look something like this:

Assuming you downloaded to `/Users/person/Downloads`:

```
mkdir metabase
```

then

```
mv /Users/person/Downloads/metabase.jar ~/metabase
```

### 3. Change into your new Metabase directory and run the jar.

Change into the directory you created in step 2:

```
cd ~/metabase
```

Now that you have Java working you can run the JAR from a terminal with:

```
java -jar metabase.jar
```

## Launching Metabase

Metabase will start using the default settings. You should see some log entries starting to run in your terminal window showing you the application progress as it starts up. Once Metabase is fully started you'll see a confirmation such as:

```
...
06-19 10:29:34 INFO metabase.task :: Initializing task CheckForNewVersions
06-19 10:29:34 INFO metabase.task :: Initializing task SendAnonymousUsageStats
06-19 10:29:34 INFO metabase.task :: Initializing task SendAbandomentEmails
06-19 10:29:34 INFO metabase.task :: Initializing task SendPulses
06-19 10:29:34 INFO metabase.task :: Initializing task SendFollowUpEmails
06-19 10:29:34 INFO metabase.task :: Initializing task TaskHistoryCleanup
06-19 10:29:34 INFO metabase.core :: Metabase Initialization COMPLETE
```

At this point you're ready to go! You can access your new Metabase server on port 3000, most likely at [http://localhost:3000](http://localhost:3000)

You can use another port than 3000 by setting the `MB_JETTY_PORT` [environment variable](./environment-variables.md) before running the jar.

Note that in the default configuration Metabase will use a local H2 database for storing all its own application data. This is meant for simple evaluations or personal use, so if you want to run Metabase in production we recommend you [migrate away from H2](./migrating-from-h2.md).

## Production installation

The steps are the same as above with one important difference: if you want to run Metabase in production, you'll want to use a production-ready database to store your Metabase application data. Here are some [databases we recommend](migrate-from-h2.md#databases-we-recommend-for-storing-your-metabase-application-data).

For example, say you want to use PostgreSQL. You would get a PostgreSQL service up and running and create a database:

```
createdb metabaseappdb
```

You can all your app DB whatever you want. No need to create any tables, Metabase will do that for you. You'll just need to set environment-variables so Metabase knows how to connect to your database. 

You'll create a directory for your Metabase like in the steps listed above for the [Local installation](#local-installation), but when it's time to run the `java -jar` command to start up the JAR, you need to include some environment variables to tell Metabase how to connect to the `metabaseappdb` you created.

You can prefix the `java -jar metabase.jar` command with these environment variables like so:

```
export MB_DB_TYPE=postgres
export MB_DB_DBNAME=metabaseappdb
export MB_DB_PORT=5432
export MB_DB_USER=username
export MB_DB_PASS=password
export MB_DB_HOST=localhost
java -jar metabase.jar
```

The above command would connect Metabase to your Postgres database, `metabaseappdb` via `localhost:5432` with the user account `username` and password `password`.

## Migrating to a production installation

If you've already created questions, dashboards, collections and so on, and you want to migrate them to the production-ready database, see [Migrating from MetabasePreparing Metabase for running in production](migrating-from-h2).

## Troubleshooting

If you run into any problems during installation, check out our [troubleshooting page](../troubleshooting-guide/running.md).

## Upgrading Metabase

See [Upgrading Metabase](upgrading-metabase.md).

## Continue to setup

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).
