
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
