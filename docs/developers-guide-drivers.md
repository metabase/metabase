# Metabase Community Drivers

As of Metabase 0.32, it's now possible to develop your own 3rd-party database drivers! Always wanted Metabase to be able to query the latest and greatest data source? Well now it's possible and all you have to do is write a little Clojure!

There are already a number of existing drivers out there. While we don't specifically endorse any of these drivers, we thought it would be helpful to have a central place to list them.

## Community Database Drivers

Please note that you install these at your own risk. The plugins will run as part of your Metabase instance and, as such, will have access to anything it does. These are the currently known 3rd-party database drivers for Metabase.

| Database | GitHub Stars | Last release (_if available_) |
| ---- | ---- | ----|
| [Amazon Athena](https://github.com/dacort/metabase-athena-driver) | ![GitHub stars](https://img.shields.io/github/stars/dacort/metabase-athena-driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/dacort/metabase-athena-driver) |
| [ClickHouse](https://github.com/enqueue/metabase-clickhouse-driver) | ![GitHub stars](https://img.shields.io/github/stars/enqueue/metabase-clickhouse-driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/enqueue/metabase-clickhouse-driver) |
| [CSV](https://github.com/Markenson/csv-metabase-driver) | ![GitHub stars](https://img.shields.io/github/stars/Markenson/csv-metabase-driver) ||
| [Cube.js](https://github.com/lili-data/metabase-cubejs-driver) | ![GitHub stars](https://img.shields.io/github/stars/lili-data/metabase-cubejs-driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/lili-data/metabase-cubejs-driver) |
| [Datomic](https://github.com/lambdaisland/metabase-datomic) | ![GitHub stars](https://img.shields.io/github/stars/lambdaisland/metabase-datomic) ||
| [DB2](https://github.com/dludwig-jrt/metabase-db2-driver) | ![GitHub stars](https://img.shields.io/github/stars/dludwig-jrt/metabase-db2-driver) ||
| [Firebird](https://github.com/evosec/metabase-firebird-driver) | ![GitHub stars](https://img.shields.io/github/stars/evosec/metabase-firebird-driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/evosec/metabase-firebird-driver) |
| [Teradata](https://github.com/swisscom-bigdata/metabase-teradata-driver) | ![GitHub stars](https://img.shields.io/github/stars/swisscom-bigdata/metabase-teradata-driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/swisscom-bigdata/metabase-teradata-driver) |
| [Spark Databricks](https://github.com/ifood/metabase-sparksql-databricks-driver) | ![GitHub stars](https://img.shields.io/github/stars/ifood/metabase-sparksql-databricks-driver) | ![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/ifood/metabase-sparksql-databricks-driver) |

If the driver you're looking for isn't available, take a look at the [Writing a Driver](https://github.com/metabase/metabase/wiki/Writing-a-Driver) wiki page. It's still a work in progress, but should give you a good start.

## Driver Development Announcements

Occasionally, we may make changes to Metabase that impact database drivers. We'll try to give folks as much of a heads up as possible. For notifications regarding this, please use the form below to subscribe to the [Metabase Community Authors mailing list](http://eepurl.com/gQcIO9). This will be a low-volume email list that we will only use to notify you of important annoucements related to driver development.

## Driver Development Questions

If you have questions related to driver development, feel free to post on our [driver development forum](https://discourse.metabase.com/c/driver-development). 