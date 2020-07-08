# Metabase

Metabase is the easy, open source way for everyone in your company to ask questions and learn from data.

![Metabase Product Screenshot](docs/metabase-product-screenshot.png)

[![Latest Release](https://img.shields.io/github/release/metabase/metabase.svg?label=latest%20release)](https://github.com/metabase/metabase/releases)
[![GitHub license](https://img.shields.io/badge/license-AGPL-05B8CC.svg)](https://github.com/metabase/metabase/blob/master/LICENSE.txt)
[![Circle CI](https://circleci.com/gh/metabase/metabase.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase)
[![codecov](https://codecov.io/gh/metabase/metabase/branch/master/graph/badge.svg)](https://codecov.io/gh/metabase/metabase)

# Features

- 5 minute [setup](https://metabase.com/docs/latest/setting-up-metabase.html) (We're not kidding)
- Let anyone on your team [ask questions](https://metabase.com/docs/latest/users-guide/04-asking-questions.html) without knowing SQL
- Rich beautiful [dashboards](https://metabase.com/docs/latest/users-guide/06-sharing-answers.html) with auto refresh and fullscreen
- [SQL Mode](https://www.metabase.com/docs/latest/users-guide/writing-sql.html) for analysts and data pros
- Create canonical [segments and metrics](https://metabase.com/docs/latest/administration-guide/07-segments-and-metrics.html) for your team to use
- Send data to Slack or email on a schedule with [Pulses](https://metabase.com/docs/latest/users-guide/10-pulses.html)
- View data in Slack anytime with [MetaBot](https://metabase.com/docs/latest/users-guide/11-metabot.html)
- [Humanize data](https://metabase.com/docs/latest/administration-guide/03-metadata-editing.html) for your team by renaming, annotating and hiding fields
- See changes in your data with [alerts](https://www.metabase.com/docs/latest/users-guide/15-alerts.html)

For more information check out [metabase.com](https://metabase.com/)

## Supported databases

- Amazon Redshift
- Druid
- Google Analytics
- Google BigQuery
- H2
- MongoDB
- MySQL
- Oracle
- PostgreSQL
- Presto
- Snowflake
- SparkSQL
- SQL Server
- SQLite
- Vertica

Don't see your favorite database? Check the list of [community supported drivers](https://www.metabase.com/docs/latest/developers-guide-drivers.html#how-to-use-a-community-built-driver).

## Installation

Metabase can be run just about anywhere so checkout our [Installation Guides](https://www.metabase.com/docs/latest/operations-guide/installing-metabase.html) for detailed instructions for various deployments. Here's the TLDR:

### Docker

To run Metabase via Docker, just type

```
docker run -d -p 3000:3000 --name metabase metabase/metabase
```

### JAR file

To run Metabase via a JAR file, you will need to have a Java Runtime Environment installed on your system.

We recommend the latest LTS version of JRE from [AdoptOpenJDK](https://adoptopenjdk.net/releases.html) with HotSpot JVM and x64 architecture, but other [Java versions](https://www.metabase.com/docs/latest/operations-guide/java-versions.html) might work too.

Go to the [Metabase download page](https://metabase.com/start/jar.html) and download the latest release. Place the downloaded JAR file into a newly created directory (as it will create some files when it is run), and run it with the following command:

```
java -jar metabase.jar
```

Now, open a browser and go to [http://localhost:3000](http://localhost:3000) , and you will be asked a set of questions that will set up a user account, and then you can add a database connection. For this to work you will need to get some information about which database you want to connect to, such as the Host Name and Port that it is running on, the Database Name and the User and Password that you will be using.

Once you have added this connection, you will be taken into the app and you'll be ready to ask your first question.

For a more detailed walkthrough, check out our [Getting Started](https://www.metabase.com/docs/latest/getting-started.html) guide.

# Frequently Asked Questions

Some questions come up over and over again. Check here first:
[FAQ](https://www.metabase.com/docs/latest/faq/start.html)

# Security Disclosure

Security is very important to us. If you discover any issue regarding security, please disclose the information responsibly by sending an email to security@metabase.com and not by creating a GitHub issue.

# Contributing

To get started with a development installation of the Metabase, follow the instructions at our [Developers Guide](https://www.metabase.com/docs/latest/developers-guide.html).

Then take a look at our [Contribution Guide](https://www.metabase.com/docs/latest/contributing.html) for information about our process and where you can fit in!

# Internationalization

We want Metabase to be available in as many languages as possible. See which translations are available and help contribute to internationalization using our project over at [POEditor](https://poeditor.com/join/project/ynjQmwSsGh). You can also check out our [policies on translations](https://www.metabase.com/docs/latest/faq/general/what-languages-can-be-used-with-metabase.html).

# Extending and Deep Integrations

Metabase also allows you to hit our Query API directly from Javascript to integrate the simple analytics we provide with your own application or third party services to do things like:

- Build moderation interfaces
- Export subsets of your users to third party marketing automation software
- Provide a specialized customer lookup application for the people in your company

# Danger zone

The button below will deploy the branch where this README.md lives onto Heroku. Metabase developers use it to deploy branches of Metabase to test our PRs, etc. We DO NOT recommend you using this for production. Instead, please use a [stable build](https://metabase.com/start/).

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

# License

Unless otherwise noted, all Metabase source files are made available under the terms of the GNU Affero General Public License (AGPL).

See [LICENSE.txt](https://github.com/metabase/metabase/blob/master/LICENSE.txt) for details and exceptions.

Unless otherwise noted, all files © 2020 Metabase, Inc.
