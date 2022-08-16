---
title: Partner and community drivers
---

# Partner and community drivers

In addition to our [Officially supported drivers](../databases/connecting.md#officially-supported-databases), many people build and maintain drivers for database integrations.

We have two types of third-party drivers:

- [Partner drivers](#partner-drivers)
- [Community drivers](#community-drivers)

## How to use a third-party driver

### Self-hosted

To use a Partner or Community driver on a self-hosted Metabase:

1. Download the latest jar file from the driver's repository (see the repo's Releases section for the JAR files).
2. Copy the JAR file into the plugins directory in your Metabase directory (the directory where you run the Metabase JAR).

You can change the location of the plugins directory by setting the environment variable `MB_PLUGINS_DIR`.

### Metabase Cloud

Partner drivers, like officially supported drivers, are available out-of-the-box on Metabase cloud. No action needed.

Community drivers are not supported on Metabase Cloud.

## Partner drivers

Partner drivers are available both on Metabase Cloud and on self-hosted Metabases.

To qualify as a partner driver, the driver must:

- Have a sponsor (usually the database's vendor) who has committed to maintaining the driver for future releases.
- Pass the Metabase test suite and a code review by our team.
- Have a permissive license.

Current partner drivers:

- [Exasol](https://github.com/exasol/metabase-driver)
- [Firebolt](https://docs.firebolt.io/integrations/business-intelligence/connecting-to-metabase.html)
- [Starburst (compatible with Trino)](https://github.com/starburstdata/metabase-driver)

Partner drivers are available to Cloud customers out-of-the-box.

If you have interest in becoming a partner, please fill the [partner form](https://www.metabase.com/partners/join/) and we will get in touch.

## Community drivers

> Note: Metabase Cloud doesn't support community drivers

Anyone can build a community driver. These are the currently known third-party database drivers for Metabase.

You install these drivers at your own risk. The plugins will run as part of your Metabase instance and, as such, will have access to anything it does.

| Database                                                                                | GitHub Stars                                                                                          | Last release (_if available_)                                                                                                 |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Amazon Athena](https://github.com/dacort/metabase-athena-driver)                       | ![GitHub stars](https://img.shields.io/github/stars/dacort/metabase-athena-driver)                    | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/dacort/metabase-athena-driver)                    |
| [ClickHouse](https://github.com/enqueue/metabase-clickhouse-driver)                     | ![GitHub stars](https://img.shields.io/github/stars/enqueue/metabase-clickhouse-driver)               | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/enqueue/metabase-clickhouse-driver)               |
| [CSV](https://github.com/Markenson/csv-metabase-driver)                                 | ![GitHub stars](https://img.shields.io/github/stars/Markenson/csv-metabase-driver)                    | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/Markenson/csv-metabase-driver)                    |
| [Cube.js](https://github.com/lili-data/metabase-cubejs-driver)                          | ![GitHub stars](https://img.shields.io/github/stars/lili-data/metabase-cubejs-driver)                 | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/lili-data/metabase-cubejs-driver)                 |
| [Datomic](https://github.com/lambdaisland/metabase-datomic)                             | ![GitHub stars](https://img.shields.io/github/stars/lambdaisland/metabase-datomic)                    |                                                                                                                               |
| [DB2](https://github.com/dludwig-jrt/metabase-db2-driver)                               | ![GitHub stars](https://img.shields.io/github/stars/dludwig-jrt/metabase-db2-driver)                  |                                                                                                                               |
| [Firebird](https://github.com/evosec/metabase-firebird-driver)                          | ![GitHub stars](https://img.shields.io/github/stars/evosec/metabase-firebird-driver)                  | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/evosec/metabase-firebird-driver)                  |
| [Impala](https://github.com/brenoae/metabase-impala-driver)                             | ![GitHub stars](https://img.shields.io/github/stars/brenoae/metabase-impala-driver)                   | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/brenoae/metabase-impala-driver)                   |
| [Materialize](https://github.com/MaterializeInc/metabase-materialize-driver)            | ![GitHub stars](https://img.shields.io/github/stars/MaterializeInc/metabase-materialize-driver)       | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/MaterializeInc/metabase-materialize-driver)       |
| [Neo4j](https://github.com/bbenzikry/metabase-neo4j-driver)                             | ![GitHub stars](https://img.shields.io/github/stars/bbenzikry/metabase-neo4j-driver)                  | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/bbenzikry/metabase-neo4j-driver)                  |
| [Spark Databricks](https://github.com/fhsgoncalves/metabase-sparksql-databricks-driver) | ![GitHub stars](https://img.shields.io/github/stars/fhsgoncalves/metabase-sparksql-databricks-driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/fhsgoncalves/metabase-sparksql-databricks-driver) |
| [Teradata](https://github.com/swisscom-bigdata/metabase-teradata-driver)                | ![GitHub stars](https://img.shields.io/github/stars/swisscom-bigdata/metabase-teradata-driver)        | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/swisscom-bigdata/metabase-teradata-driver)        |

If you don't see a driver for your database, then try looking in the comments of the [issue related to the database](https://github.com/metabase/metabase/labels/Database%2F). You might also find more by [searching on GitHub](https://github.com/search?q=metabase+driver).

If you are having problems installing or using a community driver, your best bet is to contact the author of the driver.

[Metabase Cloud](https://www.metabase.com/start/) doesn't support community drivers, meaning that (for now) you can only use Metabase Cloud with the [officially supported drivers](../databases/connecting.md#officially-supported-databases), and the partner drivers listed above.

## Write your own driver

Check out [Guide to writing a Metabase driver](./developers-guide/drivers/start.md).
