# Overview

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

Typically once enough data is in the system and/or the transformation needs are complex enough, a dedicated analytics database is used. There are many options ranging from a normal general purpose database (MySQL, Postgres, SQL Server, etc), to a dedicated Analytics database (Vertica, Redshift, GreenPlum, Terredata, etc), the new generation of SQL on Hadoop databases (Spark, Presto) or NoSQL databases (Druid, Cassandra, etc). 


It is rare that your applications database will have all the data you need and be structured in a way that lets you ask all of the questions you are interested in. Typically an application database will have a schema optimized for small reads and updates, while most analytics queries typically touch a large fraction of a table. 

# Ingestion
## From other databases

If your database is small enough, then it is generally easy enough to dump the whole database and then ingest it into your data warehouse. 

### Postgres
### MySQL
### Heroku

## Events
## Third party data

# Transformation
## Uniques
## Event Enrichment
## Denormalization
## Working backwards from Metrics Example


