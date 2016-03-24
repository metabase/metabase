FROM java:openjdk-7-jre-alpine

# need bash
RUN apk add --update bash

# fix broken cacerts
RUN apk add --update java-cacerts && \
    rm -f /usr/lib/jvm/default-jvm/jre/lib/security/cacerts && \
    ln -s /etc/ssl/certs/java/cacerts /usr/lib/jvm/default-jvm/jre/lib/security/cacerts

# add Metabase jar
COPY ./metabase.jar /app/

# add our run script to the image
COPY ./run_metabase.sh /app/
RUN chmod 755 /app/run_metabase.sh

# tidy up
RUN rm -rf /tmp/* /var/cache/apk/*

# expose our default runtime port
EXPOSE 3000

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
