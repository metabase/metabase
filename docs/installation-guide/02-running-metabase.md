
# Running the server

## Locally

The metabase jar can be run in a number of ways. Simplest is simply to run the jar on any commandline or shell that allows you to run Java programs.  It can run on any java platform that supports Java 6 or more recent versions. To check that you have a working java platform, go to a command shell and type 
`java -version`

If you see something like

    java version "1.60_65"
    Java (TM) SE Runtime Environment (build 1.6.0_65-b14-466.1-11M4716)
    Java HotSpot (TM) 64-Bit Server VM (build 20.65-b04-466.1, mixed mode)

you're good to go. Otherwise, you should install the Java JDK from [Oracle's Java Downloads page](http://www.oracle.com/technetwork/java/javase/downloads/index.html)

Assuming you have a working JDK, you can now run the jar with a command line of 

`java -jar metabase-0.10.0.jar` 

(assuming the jar you downloaded is 'metabase-0.10.0.jar')

Note that unless you specified an alternative application database, this will create a file called "metabase.db.h2.db" in the current directory. It is generally advisable to place the jar in its own directory.

Running the jar directly in a shell is typically the first step in trying out Metabase, and can in a pinch be used for a quick and dirty deployment on a shared server. However, if you are going to be running Metabase on an instance connected to the internet, you should use a more hardened deployment model.

## In production

There are a number of ways to run Metabase in production. 

### Elastic Beanstalk

See [Elastic Beanstalk Installation Recipe](installing-on-elastic-beanstalk.md) for detailed step by step instructions to install Metabase on Elastic Beanstalk.

### Running in a container

When running on a container, you'll typically want to use a separate database, and pass in the variables. If you wish to store the application database on the container host filesystem, you can using something similar to the below in your docker file:
    
    FROM ubuntu:trusty
    ENV LC_ALL C
    ENV DEBIAN_FRONTEND noninteractive
    ENV DEBCONF_NONINTERACTIVE_SEEN true
    ENV MB_JETTY_HOST 0.0.0.0
    ENV MB_JETTY_PORT 3000
    ENV DB_FILE_NAME /app/files/metabase

    VOLUME ["/app/files"]

    EXPOSE 3000

    RUN apt-get update && \
        apt-get install -y openjdk-7-jre

    ADD ./metabase-0.10.0.jar /app/
    ENTRYPOINT ["java", "-Dlogfile.path=target/log", "-XX:+CMSClassUnloadingEnabled", "-XX:+UseConcMarkSweepGC", "-jar", "/app/metabase-0.10.0.jar"]


### Running the jar using `screen` or as a daemon

If you Know What You're Doing, you can run the jar however it is you usually deploy JVM applications. 

###  HTTPS!

Regardless of how you deploy Metabase, it is *strongly* recommended that you use HTTPS for all traffic. If you are using Elastic Beanstalk or AWS, we recommend you use ELB and terminate the HTTPS connection there. Otherwise, you can use nginx as a reverse proxy and terminate there.

