
**This guide will teach you:**

> [How to install Metabase](#installing-metabase)  
> [Tips for troubleshooting various issues](#troubleshooting-metabase)  
> [Common customizations](#customizing-metabase)


# <a name="installing-metabase"></a>Installing and Running Metabase

Metabase is built and packaged as a Java jar file and can be run anywhere that Java is available.  Below we provide detailed instructions on how to install and run Metabase in a variety of common configurations.

#### [Running the Jar File](running-the-metabase-jar-file.md)
This is the simplest and most basic way of running Metabase.  Here we'll cover the general requirements for running Metabase and provide some information about how to customize your installation for any scenario.

#### [Running the Mac Application](running-the-metabase-mac-app.md)
Metabase provides a binary Mac OS X application for users who are interested in trying Metabase on a Mac system.

#### [Running on Docker](running-metabase-on-docker.md)
If you are using Docker containers and prefer to manage your Metabase installation that way then we've got you covered.  This guide discusses how to use the Metabase Docker image to launch a container running Metabase.


### Cloud Platforms

#### [Running on AWS Elastic Beanstalk](running-metabase-on-elastic-beanstalk.md)
Step-by-step instructions on how to deploy Metabase on Elastic Beanstalk using RDS.  This is the most common way to run Metabase in production.

#### [Running on Heroku](running-metabase-on-heroku.md)
Currently in beta.  We've run Metabase on Heroku and it works just fine, but it's not hardened for production use just yet.  If you're up for it then give it a shot and let us know how we can make it better!


# <a name="troubleshooting-metabase"></a>Troubleshooting Common Problems

### Metabase fails to startup

Sometimes Metabase will fail to complete its startup due to a database lock that was not cleared properly.

When this happens, go to a terminal where Metabase is installed and run:

    java -jar metabase.jar migrate release-locks

in the command line to manually clear the locks.  Then restart your Metabase instance.


# <a name="customizing-metabase"></a>Custom Options

#### HTTPS Support

Regardless of how you deploy Metabase, it is *strongly* recommended that you use HTTPS for all traffic. If you are using Elastic Beanstalk or AWS, we recommend you use ELB and terminate the HTTPS connection there. Otherwise, you can use nginx as a reverse proxy and terminate there.

#### [Backing up your Metabase](backing-up-the-metabase-database.md)
Better safe than sorry we always say.  Simple instructions to help with backing up a Metabase instance.
