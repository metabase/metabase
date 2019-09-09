FROM adoptopenjdk/openjdk11:alpine-jre

ENV FC_LANG en-US
ENV LC_CTYPE en_US.UTF-8

# dependencies
RUN apk add --update bash ttf-dejavu fontconfig

# add Metabase jar
COPY ./metabase.jar /app/
RUN chmod o+r /app/metabase.jar

# add our run script to the image
COPY ./run_metabase.sh /app/

# create the plugins directory, with writable permissions
RUN mkdir -p /plugins
RUN chmod a+rwx /plugins

# expose our default runtime port
EXPOSE 3000

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
