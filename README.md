[![Circle CI](https://circleci.com/gh/metabase/metabase-init.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase-init)

# Overview

Metabase Report server is an easy way to generate charts and dashboards, ask simple ad hoc queries without using SQL, and see detailed information about rows in your Database. You can set it up in under 5 minutes, and then give yourself and others a place to ask simple questions and understand the data your application is generating. It is not tied to any specific framework and can be used out of the box with minimal configuration.

With a bit of tagging and annotation of what the tables and fields in your database mean, it can be used to provide a rich, humanized version analytics server and administration interface.

# What it isn't

The Report Server does not deal with getting data into a database or data warehouse or with transforming your data into a representation that lets you answer specific questions. Most sophisticated installations will have separate Ingestion processes that get data from third parties, event collectors or database snapshots into a Data Warehouse as well as Transformation Processes that join, denormalize, enrich or otherwise get your data into a shape that more convenient for use in analytics.

The report server does not collect web page views or mobile events, though it can help you understand conversion funnels, cohort retention and use behavior in general once you have collected these events into a database.

See the [Data Warehouse Guide](docs/DATAWAREHOUSING.md) for more information and advice.

# Security Disclosure

Security is very important to us. If discover any issue regarding security, please disclose the information responsibly by sending an email to security@metabase.com and not by creating a github issue.

# Installation

To run the Report server you will need to have a Java Runtime installed. As a quick check to see if you system already has one, try

    java -version

If you see something like

    java version "1.8.0_31"
    Java(TM) SE Runtime Environment (build 1.8.0_31-b13)
    Java HotSpot(TM) 64-Bit Server VM (build 25.31-b07, mixed mode)

you are good to go. Otherwise, download the Java Runtime Environment at http://java.com/

To install the Query Server, go to the [Metabase Download Page](http://www.metabase.com/download) and download the current build. Place the downloaded jar into a newly created directory (as it will create some files when it is run), and run it on the command line:

    java -jar metabase.jar

On the first run of the Report Server, the command line invocation will output a line like

    http://localhost:3000/setup/init/XXXXX

where XXXXX is a randomly generated token that can only be used to set up your first account for that particular installation. Once you have created that account, the token (and that URL) will no longer work.

On logging in, you will be asked a set of questions that will set up a user account, and then you can add a database connection. For this to work you will need to get some information about which database you want to connect to, such as the Host Name and Port that it is running on, the Database Name and the User and Password that you will be using.

Once you have added this connection, you will be taken into the app and you'll be ready to ask your first question.

For more information or troubleshooting, check out the [Installation Guide](docs/INSTALLATION.md)

# Getting Started

Follow our [Getting Started](docs/GETTINGSTARTED.md) guide to learn how to use the Report Server.

# Contributing

To get started with a development installation of the Query Server and learn more about contributing, please follow the instructions at our [Developers Guide](docs/DEVELOPERS.md).

# Extending and Deep Integrations

Metabase also allows you to hit our Query API directly from Javascript to integrate the simple analytics we provide with your own application or third party services to do things like:

* Build moderation interfaces
* Export subsets of your users to third party marketing automation software
* Provide a specialized customer lookup application for the people in your company


# License

Unless otherwise noted, all Metabase Report Server source files are made available under the terms of the GNU Affero General Public License (AGPL).

See individual files for details.

Copyright © 2015 Metabase, Inc
