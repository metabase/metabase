FROM openjdk:8-jre-alpine

ENV FC_LANG en-US
ENV LC_CTYPE en_US.UTF-8

# dependencies
RUN apk add --update bash ttf-dejavu fontconfig

# fix broken cacerts
RUN apk add --update java-cacerts && \
    rm -f /usr/lib/jvm/default-jvm/jre/lib/security/cacerts && \
    ln -s /etc/ssl/certs/java/cacerts /usr/lib/jvm/default-jvm/jre/lib/security/cacerts && \
    rm -rf /tmp/* /var/cache/apk/*

# add Metabase jar
COPY ./metabase.jar /app/

# add our run script to the image
COPY ./run_metabase.sh /app/

# expose our default runtime port
EXPOSE 3000

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
