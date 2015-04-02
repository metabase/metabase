[![Circle CI](https://circleci.com/gh/metabase/metabase-init.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase-init)

# Overview

Metabase Report server is an easy way to generate charts and dashboards, ask simple ad hoc queries without using SQL, and see detailed information about rows in your Database. You can set it up in under 5 minutes, and then give yourself and others a place to ask simple questions and understand the data your application is generating. It is not tied to any specific framework and can be used out of the box with no configuration. 

With a bit of tagging and annotation of what the tables and fields in your database mean, it can be used to provide a rich, humanized version administration interface. It also allows you to hit our Query API directly from Javascript to integrate the simple analytics we provide with your own application or third party services to do things like:

* Build moderation interfaces
* Export subsets of your users to third party marketing automation software
* Provide a specialized customer lookup application for the people in your company

# What it isn't

The Report Server does not deal with getting data into a database or data warehouse or with transforming your data into a representation that lets you answer specific questions. Most sophisticated installations will have separate Ingestion processes that get data from third parties, event collectors or database snapshots into a Data Warehouse as well as Transformation Processes that join, denormalize, enrich or otherwise get your data into a shape that more convenient for use in analytics. 

The report server does not collect web page views or mobile events, though it can help you understand conversion funnels, cohort retention and use behavior in general once you have collected these events into a database. 

See [Data Preparation Guide](www.metabase.com/etl) for more information and advice.

# Security Disclosure

Security is very important to us. If you have any issue regarding security, please disclose the information responsibly by sending an email to security@metabase.com and not by creating a github issue.

# Installation

To run the Report server you will need to have a Java Runtime installed. As a quick check to see if you system already has one, try 

    java -version

If you see something like 

    java version "1.8.0_31"
    Java(TM) SE Runtime Environment (build 1.8.0_31-b13)
    Java HotSpot(TM) 64-Bit Server VM (build 25.31-b07, mixed mode)

you are good to go. Otherwise, download the Java Runtime Environment at http://java.com/

To install the Query Server, go to the [Metabase Download Page](www.metabase.com/download) and download the current build. Place the downloaded jar into a newly created directory (as it will create some files when it is run), and run it on the command line:

    java -jar metabase.jar    

On the first run of the Report Server, the command line invocation will output a line like

    http://localhost:3000/setup/init/XXXXX

where XXXXX is a randomly generated token that can only be used to set up your first account for that particular installation. Once you have created that account, the token (and that URL) will no longer work. 

On logging in, you will be asked a set of questions that will set up a user account, and then you can add a database connection. For this to work you will need to get some information about which database you want to connect to, such as the Host Name and Port that it is running on, the Database Name and the User and Password that you will be using. 

Once you have added this connection, you will be taken into the app and you'll be ready to ask your first question. 

# Getting Started

Follow our [Getting Started](www.metabase.com/start) guide to learn how to use the Report Server.

# Contributing

To get started with a development installation of the Query Server, please follow the instructions at our [Developers Guide](DEVELOPERS.md). 

In general, we like to have an open issue for every pull request as a place to discuss the nature of any bug or proposed improvement. Each pull request should address a single issue, and contain both the fix as well as a description of how the pull request and tests that validate that the PR fixes the issue in question.

For significant feature additions, it is expected that discussion will have taken place in the attached issue. Any feature that requires a major decision to be reached will need to have an explicit design document written. The goals of this document are to make explicit the assumptions, constraints and tradeoffs any given feature implementation will contain. The point is not to generate documentation but to allow discussion to reference a specific proposed design and to allow others to consider the implications of a given design. 

We don't like getting sued, so for every commit we require a Linux Kernel style developer certificate. If you agree to the below terms (from http://developercertificate.org/)

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.
660 York Street, Suite 102,
San Francisco, CA 94110 USA

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

Then you just add a line to every git commit message:

    Signed-off-by: Helpful Contributor <helpful.contributor@email.com>

All contributions need to be signed with your real name.


# License

Unless otherwise noted, all Metabase Report Server source files are made available under the terms of the GNU Affero General Public License (AGPL). 

See individual files for details.

Copyright © 2015 Metabase, Inc