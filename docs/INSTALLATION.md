# Application database

By default, Metabase uses an embedded database ([H2](http://www.h2database.com/)). If you want to use another database (for ease of administration, backup, or any other reason) you can inject the alternative database vis environment variables. For example

    export MB_DB_TYPE=postgres 
    export MB_DB_DBNAME=metabase 
    export MB_DB_PORT=5432 
    export MB_DB_USER=username 
    export MB_DB_PASS=password
    export MB_DB_HOST=localhost
    java -jar metabase.jar

would run the application using a local postgres server instead of the default embedded database.

# Backing up 

The application will create file named "metabase.db.h2.db" in the directory it is being run in. This can be backed up by either stopping the application server and backing up this file. Alternatively to backup the application data while it is running, you can follow the methods described at the relevant [H2 documentation](http://www.h2database.com/html/tutorial.html#upgrade_backup_restore)


# Database connection strings

If you need to access connections over SSL, you should set an environment variable MB_POSTGRES_SSL to true in the environment that you use to run the application, eg
 
    MB_POSTGRES_SSL=true java -jar ./metabase.jar

# Scaling

Typically, you'll want to evaluate the application on any database you have access to. If you want to expose the application to other users, you should carefully consider how you access your database. In addition as the data sizes grow, there will be a number of options in how you should setup your overall analytics infrastructure.

## Starting out

It is typical to point this to a production database of a small application (or a large application with a small number of users). This typically works for periods before launch or when the database is either static, or has a small number of users (like internal applications or low volume but high value paid applications). Eventually, as usage of the Query Server grows, and the load on the production database increases a couple of things happen

* Expensive queries can slow down the database for production users
* The occasional scans (like on first installation) the Query Server runs to keep its internal representations of your database sync'd might add significant load
* Any recurring queries you run might start to add significant load
* You might need to import third party data for analysis, which typically should not live on your main database

At some point, you should separate out your main application database and your analytics database. There are a number of ways to do this.

## Read Replica

Assuming you do not need to do a lot of transformation or ingest lots of third party data sources, this can be a good stopgap to setting up a complete data/analytics infrastructure. For MySQL or Postgres, just set up a read replica and make sure to not let production application servers hit it for normal queries.


## Dedicated analytics database

Typically once enough data is in the system and/or the tranformation needs are complex enough, a dedicated analytics database is used. There are many options ranging from a normal general purpose database (MySQL, Postgres, SQL Server, etc), to a dedicated Analytics database (Vertica, Redshift, GreenPlum, Terredata, etc), the new generation of SQL on Hadoop databases (Spark, Presto) or NoSQL databases (Druid, Cassandra, etc). 

Typically, once there is a dedicated analytics database or a datawarehouse, ETL processes become important. Learn more at See the [Data Warehouse Guide](DATAWAREHOUSING.md).

# Database Drivers
Metabase currently has drivers for

* H2
* MySQL
* PostgreSQL

On our roadmap are

* [Druid](www.github.com/metabase/metabase-init/issues/X)
* [MongoDB](www.github.com/metabase/metabase-init/issues/X) 
* [Presto](www.github.com/metabase/metabase-init/issues/X)

If you are interested in the status of any of these drivers, click through to the issues to see what work is being done. If you are interested in a driver to another database, please open an issue!

# Annotating Data
[Data Annotations](ANNOTATIONS.md)