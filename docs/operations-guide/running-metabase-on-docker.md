### Running Metabase on Docker

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
