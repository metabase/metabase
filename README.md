# Metabase
Metabase is the easy, open source way for everyone in your company to ask questions and learn from data.

![Metabase Product Screenshot](docs/metabase-product-screenshot.png)

[![Latest Release](https://img.shields.io/github/release/metabase/metabase.svg?label=latest%20release)](https://github.com/metabase/metabase/releases)
[![GitHub license](https://img.shields.io/badge/license-AGPL-05B8CC.svg)](https://raw.githubusercontent.com/metabase/metabase/master/LICENSE.txt)
[![Circle CI](https://circleci.com/gh/metabase/metabase.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase)
[![Gitter chat](https://badges.gitter.im/metabase/metabase.png)](https://gitter.im/metabase/metabase)

# Features
- 5 minute [setup](http://metabase.com/docs/latest/setting-up-metabase.html) (We're not kidding)
- Let anyone on your team [ask questions](http://metabase.com/docs/latest/users-guide/04-asking-questions.html) without knowing SQL
- Rich beautiful [dashboards](http://metabase.com/docs/latest/users-guide/06-sharing-answers.html) with auto refresh and fullscreen
- SQL Mode for analysts and data pros
- Create canonical [segments and metrics](http://metabase.com/docs/latest/administration-guide/07-segments-and-metrics.html) for your team to use
- Send data to Slack or email on a schedule with [Pulses](http://metabase.com/docs/latest/users-guide/10-pulses.html)
- View data in Slack anytime with [MetaBot](http://metabase.com/docs/latest/users-guide/11-metabot.html)
- [Humanize data](http://metabase.com/docs/latest/administration-guide/03-metadata-editing.html) for your team by renaming, annotating and hiding fields

For more information check out [metabase.com](http://www.metabase.com)

## Supported databases

- Postgres
- MySQL
- Druid
- SQL Server
- Redshift
- MongoDB
- Google BigQuery
- SQLite
- H2
- Oracle
- Vertica
- Presto
- Snowflake

Don't see your favorite database? File an issue to let us know.

## Installation

Metabase can be run just about anywhere so checkout our [Installation Guides](http://www.metabase.com/docs/latest/operations-guide/start.html#installing-and-running-metabase) for detailed instructions for various deployments.  Here's the TLDR:

### Docker

To run Metabase via Docker, just type

```sh
docker run -d -p 3000:3000 --name metabase metabase/metabase
```

### JVM Jar

To run the jar you will need to have a Java Runtime installed. As a quick check to see if you system already has one, try

```sh
java -version
```

If you see something like

```sh
java version "1.8.0_51"
Java(TM) SE Runtime Environment (build 1.8.0_51-b16)
Java HotSpot(TM) 64-Bit Server VM (build 25.51-b03, mixed mode)
```

you are good to go. Otherwise, download the Java Runtime Environment at http://java.com/

Go to the [Metabase Download Page](http://www.metabase.com/start/) and download the current build. Place the downloaded jar into a newly created directory (as it will create some files when it is run), and run it on the command line:

```sh
java -jar metabase.jar
```

Now, open a browser and go to [http://localhost:3000](http://localhost:3000) , and you will be asked a set of questions that will set up a user account, and then you can add a database connection. For this to work you will need to get some information about which database you want to connect to, such as the Host Name and Port that it is running on, the Database Name and the User and Password that you will be using.

Once you have added this connection, you will be taken into the app and you'll be ready to ask your first question.

For a more detailed walkthrough, check out our [Getting Started](docs/getting-started.md) guide.

# Frequently Asked Questions

Some questions come up over and over again. Check here first:
[FAQ](docs/faq.md)

# Security Disclosure

Security is very important to us. If you discover any issue regarding security, please disclose the information responsibly by sending an email to security@metabase.com and not by creating a GitHub issue.


# Contributing

To get started with a development installation of the Metabase, follow the instructions at our [Developers Guide](docs/developers-guide.md).

Then take a look at our [Contribution Guide](docs/contributing.md) for information about our process and where you can fit in!

Talk to other contributors [in our Gitter room](https://gitter.im/metabase/metabase).

# Internationalization
We want Metabase to be avaliable in as many languages as possible. See what translations are avaliable and help contribute to internationalization using our project [over at POEditor](https://poeditor.com/join/project/ynjQmwSsGh)

# Extending and Deep Integrations

Metabase also allows you to hit our Query API directly from Javascript to integrate the simple analytics we provide with your own application or third party services to do things like:

* Build moderation interfaces
* Export subsets of your users to third party marketing automation software
* Provide a specialized customer lookup application for the people in your company


# Danger zone

The button below will deploy the branch where this README.md lives onto Heroku. Metabase developers use it to deploy branches of Metabase to test our PRs, etc. We DO NOT recommend you using this for production. Instead, please use a [stable build](http://metabase.com/start).

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

# License

Unless otherwise noted, all Metabase source files are made available under the terms of the GNU Affero General Public License (AGPL).

See [LICENSE.txt](https://github.com/metabase/metabase/blob/master/LICENSE.txt) for details and exceptions.

Unless otherwise noted, all files © 2018 Metabase, Inc.
