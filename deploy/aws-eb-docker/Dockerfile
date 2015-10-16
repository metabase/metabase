FROM ubuntu:trusty

ENV LC_ALL C
ENV LANG C.UTF-8
ENV DEBIAN_FRONTEND noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN true
ENV MB_JETTY_PORT 3000

# basic update of our system + adding Java
RUN apt-get update && \
    apt-get install -y openjdk-7-jre

# include our local build in the image
# TODO: eventually we could probably set this up to download the jar file dynamically
COPY ./metabase.jar /app/
COPY ./run_metabase.sh /app/
RUN chmod 755 /app/run_metabase.sh

# make our webserver port available
EXPOSE 3000

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
