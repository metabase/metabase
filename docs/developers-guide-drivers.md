# Community-built database drivers

As of Metabase 0.32, we now support community-built database drivers!

Several folks have already started to build drivers for database integrations that Metabase doesn't natively support. While we don't specifically endorse any of these drivers, we thought it would be helpful to have a central place to list them.

Want to build your own driver? Take a look at the [driver development](#driver-development) section below.

## How to use a community-built driver

In order to install a community driver, you would typically download the latest jar file from the relevant repository release page and copy it into the plugins directory.

All Metabase plugins live in the plugins directory, which defaults to `./plugins` in the same directory as `metabase.jar`. The plugins directory can be changed by setting the environment variable `MB_PLUGINS_DIR`.

**Note:** You install these at your own risk. The plugins will run as part of your Metabase instance and, as such, will have access to anything it does.

These are the currently known 3rd-party database drivers for Metabase. Some versions of Metabase introduces changes, which requires drivers to be updated, so make sure you are using a driver that is compatible with your version of Metabase.

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
| [Spark Databricks](https://github.com/fhsgoncalves/metabase-sparksql-databricks-driver) | ![GitHub stars](https://img.shields.io/github/stars/fhsgoncalves/metabase-sparksql-databricks-driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/fhsgoncalves/metabase-sparksql-databricks-driver) |
| [Teradata](https://github.com/swisscom-bigdata/metabase-teradata-driver)                | ![GitHub stars](https://img.shields.io/github/stars/swisscom-bigdata/metabase-teradata-driver)        | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/swisscom-bigdata/metabase-teradata-driver)        |

If you don't see a driver for your database, then try looking in the comments of the [issue related to the database](https://github.com/metabase/metabase/labels/Database%2F). You might also find more by [searching on GitHub](https://github.com/search?q=metabase+driver).

If you are having problems with installing or using a community driver, your best bet is to contact the author of the driver.

## Driver development

If the driver you're looking for isn't available, take a look at the [Writing a Driver](https://github.com/metabase/metabase/wiki/Writing-a-Driver) wiki page. It's still a work in progress, but should give you a good start. A few things to keep in mind:

- If your database has a JDBC driver, you'll be able to make use of some common classes that already exist in Metabase.
- We're still working on providing an independent test framework for drivers, but you can copy or symlink your driver into a local copy of the Metabase source code in order to utilize pre-existing tests. Take a look at [Test Extension Basics](https://github.com/metabase/metabase/wiki/Writing-a-Driver:-Adding-Test-Extensions,-Tests,-and-Setting-up-CI#test-extensions-basics) on the wiki.
- If you have questions related to driver development, feel free to post on our [driver development forum](https://discourse.metabase.com/c/driver-development).

## Driver development announcements

Occasionally, we may make changes to Metabase that impact database drivers. We'll try to give folks as much of a heads up as possible. For notifications regarding this, please use the form below to subscribe to the [Metabase Community Authors mailing list](http://eepurl.com/gQcIO9). This will be a low-volume email list that we will only use to notify you of important annoucements related to driver development.
