# Overview

The Metabase server can be run anywhere that you can run a Java jar. On installation it will have three main portions. First off is the Jar containing the server code. The most recent stable version can be download from [Metabase Downloads](http://wwww.metabase.com/downloads). Next there will need to be a place where Metabase can store persistent data, or its Application Database. Once the server is up and running with a place to store application data, you can connect to one or more Databases. 


# Application database

The application database is where metabase stores information about users, their saved questions, dashboards, as well as the semantic model of any underlying databases or data warehouses Metabase is connected to. 

By default, Metabase uses an embedded database ([H2](http://www.h2database.com/)). 

Often, when running Metabase in production, it is useful to use a another database for ease of administration, backing up the application data and in the case of deployments to AWS or other unreliable instances, to survive instances going down.
To use an alternative database, you can inject database credentials via environment variables. For example

    export MB_DB_TYPE=postgres 
    export MB_DB_DBNAME=metabase 
    export MB_DB_PORT=5432 
    export MB_DB_USER=username 
    export MB_DB_PASS=password
    export MB_DB_HOST=localhost
    java -jar metabase.jar

would run the application using a local postgres server instead of the default embedded database.

## Backing up the application database

If you use the embedded datbase, the application will create file named "metabase.db.h2.db" in the directory it is being run in. This can be backed up by either stopping the application server and backing up this file. Alternatively to backup the application data while it is running, you can follow the methods described at the relevant [H2 documentation](http://www.h2database.com/html/tutorial.html#upgrade_backup_restore)

If you are using an alternative database, you should back it up using the standard tools for that database.

# Running the server

## Locally

The metabase jar can be run in a number of ways. Simplest is simply to run the jar on any commandline or shell that allows you to run Java programs.  It can run on any java platform that supports Java 6 or more recent versions. To check that you have a working java platform, go to a command shell and type 
`java -version`

If you see something like

    java version "1.60_65"
    Java (TM) SE Runtime Environment (build 1.6.0_65-b14-466.1-11M4716)
    Java HotSpot (TM) 64-Bit Server VM (build 20.65-b04-466.1, mixed mode)

you're good to go. Otherwise, you should install the Java JDK from [Oracle's Java Downloads page](http://www.oracle.com/technetwork/java/javase/downloads/index.html)

Assuming you have a working JDK, you can now run the jar with a command line of 

`java -jar metabase-0.10.0.jar` 

(assuming the jar you downloaded is 'metabase-0.10.0.jar')

Note that unless you specified an alternative application database, this will create a file called "metabase.db.h2.db" in the current directory. It is generally advisable to place the jar in its own directory.

Running the jar directly in a shell is typically the first step in trying out Metabase, and can in a pinch be used for a quick and dirty deployment on a shared server. However, if you are going to be running Metabase on an instance connected to the internet, you should use a more hardened deployment model.

## In production

There are a number of ways to run Metabase in production. 

### Elastic Beanstalk

See [Elastic Beanstalk Installation Recipe](installing-on-elastic-beanstalk.md) for detailed step by step instructions to install Metabase on Elastic Beanstalk.

### Running in a container

When running on a container, you'll typically want to use a separate database, and pass in the variables. If you wish to store the application database on the container host filesystem, you can using something similar to the below in your docker file:
    
    FROM ubuntu:trusty
    ENV LC_ALL C
    ENV DEBIAN_FRONTEND noninteractive
    ENV DEBCONF_NONINTERACTIVE_SEEN true
    ENV MB_JETTY_HOST 0.0.0.0
    ENV MB_JETTY_PORT 3000
    ENV DB_FILE_NAME /app/files/metabase

    VOLUME ["/app/files"]

    EXPOSE 3000

    RUN apt-get update && \
        apt-get install -y openjdk-7-jre

    ADD ./metabase-0.10.0.jar /app/
    ENTRYPOINT ["java", "-Dlogfile.path=target/log", "-XX:+CMSClassUnloadingEnabled", "-XX:+UseConcMarkSweepGC", "-jar", "/app/metabase-0.10.0.jar"]


### Running the jar using `screen` or as a daemon

If you Know What You're Doing, you can run the jar however it is you usually deploy JVM applications. 

###  HTTPS!

Regardless of how you deploy Metabase, it is *strongly* recommended that you use HTTPS for all traffic. If you are using Elastic Beanstalk or AWS, we recommend you use ELB and terminate the HTTPS connection there. Otherwise, you can use nginx as a reverse proxy and terminate there.


# Connecting to Data Warehouses

In the context of this document, a data warehouse is a database that Metabase will connect to and allow its users to ask questions against. It can either be a dedicated analytics database, a full fledged data warehouse, or just another applications database. 


## Database Drivers
Metabase can currently connect to the following types of data warehouses:

* H2
* MySQL
* PostgreSQL
* Mongo

On our roadmap are

* [Druid](http://www.github.com/metabase/metabase-init/issues/655)
* [Parse](http://www.github.com/metabase/metabase-init/issues/654) 
* [Redshift](http://www.github.com/metabase/metabase-init/issues/652)

If you are interested in the status of any of these drivers, click through to the issues to see what work is being done. If you are interested in a driver to another database, please open an issue!


