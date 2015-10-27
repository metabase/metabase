[![Circle CI](https://circleci.com/gh/metabase/metabase.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase)

# Overview

Metabase is an easy way to generate charts and dashboards, ask simple ad hoc queries without using SQL, and see detailed information about rows in your Database. You can set it up in under 5 minutes, and then give yourself and others a place to ask simple questions and understand the data your application is generating. It is not tied to any specific framework and can be used out of the box with minimal configuration.

With a bit of tagging and annotation of what the tables and fields in your database mean, it can be used to provide a rich, humanized version analytics server and administration interface.

For more information check out [www.metabase.com](http://www.metabase.com)


# Security Disclosure

Security is very important to us. If discover any issue regarding security, please disclose the information responsibly by sending an email to security@metabase.com and not by creating a github issue.

# Installation

You can run Metabase in two primary ways, as a docker container or as a jar.

## Docker

To run Metabase via Docker, just type

	docker run -d -p 3000:3000 --name metabase metabase/metabase


## JVM Jar

To run the jar you will need to have a Java Runtime installed. As a quick check to see if you system already has one, try

    java -version

If you see something like

    java version "1.8.0_31"
    Java(TM) SE Runtime Environment (build 1.8.0_31-b13)
    Java HotSpot(TM) 64-Bit Server VM (build 25.31-b07, mixed mode)

you are good to go. Otherwise, download the Java Runtime Environment at http://java.com/

Go to the [Metabase Download Page](http://www.metabase.com/start/) and download the current build. Place the downloaded jar into a newly created directory (as it will create some files when it is run), and run it on the command line:

    java -jar metabase.jar


Now, open a browser and go to [http://localhost:3000](http://localhost:3000) , and you will be asked a set of questions that will set up a user account, and then you can add a database connection. For this to work you will need to get some information about which database you want to connect to, such as the Host Name and Port that it is running on, the Database Name and the User and Password that you will be using.

Once you have added this connection, you will be taken into the app and you'll be ready to ask your first question.

For a more detailed walkthrough, check out our [Getting Started](docs/getting-started.md) guide.


# Contributing

To get started with a development installation of the Query Server and learn more about contributing, please follow the instructions at our [Developers Guide](docs/developers-guide.md).

# Extending and Deep Integrations

Metabase also allows you to hit our Query API directly from Javascript to integrate the simple analytics we provide with your own application or third party services to do things like:

* Build moderation interfaces
* Export subsets of your users to third party marketing automation software
* Provide a specialized customer lookup application for the people in your company


# License

Unless otherwise noted, all Metabase source files are made available under the terms of the GNU Affero General Public License (AGPL).

See [LICENSE.txt](https://github.com/metabase/metabase/blob/master/LICENSE.txt) for details and exceptions.

Unless otherwise noted, all files © 2015 Metabase, Inc.
