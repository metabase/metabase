FROM adoptopenjdk/openjdk11:alpine-jre

ENV FC_LANG en-US LC_CTYPE en_US.UTF-8

# dependencies
RUN apk -U upgrade && apk add --update --no-cache bash ttf-dejavu fontconfig

# add Metabase jar & add our run script to the image
COPY ./metabase.jar ./run_metabase.sh /app/

# create the plugins directory, with writable permissions
RUN mkdir -p /plugins && chmod a+rwx /plugins

# expose our default runtime port
EXPOSE 3000

# if you have an H2 database that you want to initialize the new Metabase
# instance with, mount it in the container as a volume that will match the
# pattern /app/initial*.db:
# $ docker run ... -v $PWD/metabase.db.mv.db:/app/initial.db.mv.db ...

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
