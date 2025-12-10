---
title: Community drivers
redirect_from:
  - /docs/latest/developers-guide-drivers
  - /docs/latest/developers-guide/partner-and-community-drivers
---

# Community drivers

> Community drivers are not supported on [Metabase Cloud](https://www.metabase.com/cloud/).

In addition to our [Officially supported drivers](../databases/connecting.md#connecting-to-supported-databases), many people build and maintain drivers for database integrations.

## How to use a Community driver

To use a Community driver on a self-hosted Metabase:

1. Download the latest JAR file from the driver's repository (see the repo's Releases section for the JAR files).
2. Copy the JAR file into the plugins directory in your Metabase directory (the directory where you run the Metabase JAR).

You can change the location of the plugins directory by setting the environment variable [`MB_PLUGINS_DIR`](../configuring-metabase/environment-variables.md#mb_plugins_dir).

## Community drivers

> You install these drivers at your own risk. The plugins run as part of your Metabase and will have access to anything your Metabase does. And since we can’t vet for them, we don’t make them available on [Metabase Cloud](https://www.metabase.com/cloud/).

Anyone can build a community driver. These are the currently known third-party database drivers for Metabase.

| Database                                                                              | GitHub Stars                                                                                       | Last release (_if available_)                                                                                              |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [CSV](https://github.com/Markenson/csv-metabase-driver)                               | ![GitHub stars](https://img.shields.io/github/stars/Markenson/csv-metabase-driver)                 | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/Markenson/csv-metabase-driver)                 |
| [Databend](https://github.com/databendcloud/metabase-databend-driver)                 | ![GitHub stars](https://img.shields.io/github/stars/databendcloud/metabase-databend-driver)        | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/databendcloud/metabase-databend-driver)        |
| [DB2 for LUW](https://github.com/alisonrafael/metabase-db2-driver)                    | ![GitHub stars](https://img.shields.io/github/stars/alisonrafael/metabase-db2-driver)              | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/alisonrafael/metabase-db2-driver)              |
| [IBM i](https://github.com/damienchambe/metabase-ibmi-driver)                         | ![GitHub stars](https://img.shields.io/github/stars/damienchambe/metabase-ibmi-driver)             | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/damienchambe/metabase-ibmi-driver)             |
| [Dremio](https://github.com/Baoqi/metabase-dremio-driver)                             | ![GitHub stars](https://img.shields.io/github/stars/Baoqi/metabase-dremio-driver)                  | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/Baoqi/metabase-dremio-driver)                  |
| [DuckDB](https://github.com/MotherDuck-Open-Source/metabase_duckdb_driver)            | ![GitHub stars](https://img.shields.io/github/stars/MotherDuck-Open-Source/metabase_duckdb_driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/MotherDuck-Open-Source/metabase_duckdb_driver) |
| [Firebolt](https://github.com/firebolt-db/metabase-firebolt-driver)                   | ![GitHub stars](https://img.shields.io/github/stars/firebolt-db/metabase-firebolt-driver)          | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/firebolt-db/metabase-firebolt-driver)          |
| [Firebird](https://github.com/evosec/metabase-firebird-driver)                        | ![GitHub stars](https://img.shields.io/github/stars/evosec/metabase-firebird-driver)               | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/evosec/metabase-firebird-driver)               |
| [GreptimeDB](https://github.com/greptimeteam/greptimedb-metabase-driver)              | ![GitHub stars](https://img.shields.io/github/stars/greptimeteam/greptimedb-metabase-driver)       | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/greptimeteam/greptimedb-metabase-driver)       |
| [Hydra](https://www.hydra.so/blog-posts/2022-09-28-metabase-and-hydra)                | Hydra connections use the official [Postgres driver](../databases/connections/postgresql.md).      | Not applicable.                                                                                                            |
| [Impala](https://github.com/brenoae/metabase-impala-driver)                           | ![GitHub stars](https://img.shields.io/github/stars/brenoae/metabase-impala-driver)                | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/brenoae/metabase-impala-driver)                |
| [InterSystems IRIS](https://github.com/Siddardar/metabase-iris-driver/tree/main)      | ![GitHub stars](https://img.shields.io/github/stars/Siddardar/metabase-iris-driver)                | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/Siddardar/metabase-iris-driver)                |
| [Materialize](https://github.com/MaterializeInc/metabase-materialize-driver)          | ![GitHub stars](https://img.shields.io/github/stars/MaterializeInc/metabase-materialize-driver)    | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/MaterializeInc/metabase-materialize-driver)    |
| [Neo4j](https://github.com/StronkMan/metabase-neo4j-driver)                           | ![GitHub stars](https://img.shields.io/github/stars/StronkMan/metabase-neo4j-driver)               | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/StronkMan/metabase-neo4j-driver)               |
| [Netsuite SuiteAnalytics Connect](https://github.com/ericcj/metabase-netsuite-driver) | ![GitHub stars](https://img.shields.io/github/stars/ericcj/metabase-netsuite-driver)               | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/ericcj/metabase-netsuite-driver)               |
| [Peaka](https://github.com/peakacom/metabase-driver)                                  | ![GitHub stars](https://img.shields.io/github/stars/peakacom/metabase-driver)                      | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/peakacom/metabase-driver)                      |
| [SPARQL](https://github.com/jhisse/metabase-sparql-driver)                            | ![GitHub stars](https://img.shields.io/github/stars/jhisse/metabase-sparql-driver)                 | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/jhisse/metabase-sparql-driver)                 |
| [StarRocks](https://github.com/Carbon-Arc/metabase-starrocks-driver)                  | ![GitHub stars](https://img.shields.io/github/stars/Carbon-Arc/metabase-starrocks-driver)          | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/Carbon-Arc/metabase-starrocks-driver)          |
| [Teradata](https://github.com/swisscom-bigdata/metabase-teradata-driver)              | ![GitHub stars](https://img.shields.io/github/stars/swisscom-bigdata/metabase-teradata-driver)     | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/swisscom-bigdata/metabase-teradata-driver)     |

If you don't see a driver for your database, try looking in the comments of the [issue related to the database](https://github.com/metabase/metabase/labels/Database%2F). You might also find more drivers by searching on GitHub for "Metabase driver".

If you're having problems installing or using a community driver, your best bet is to contact the author of the driver.

## Write your own driver

Check out [Guide to writing a Metabase driver](./drivers/start.md).
