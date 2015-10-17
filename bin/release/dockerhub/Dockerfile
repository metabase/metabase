FROM java:openjdk-7-jre

ENV LC_ALL C
ENV LANG C.UTF-8
ENV DEBIAN_FRONTEND noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN true

# add Metabase jar
COPY ./metabase.jar /app/

# add our run script to the image
COPY ./run_metabase.sh /app/
RUN chmod 755 /app/run_metabase.sh

# expose our default runtime port
EXPOSE 3000

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
