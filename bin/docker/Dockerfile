## Remember that this runner image needs to be the same as the Dockerfile in the root with the exception that this one grabs the 
## jar from the local folder rather than the jar from the previous step in a multi-stage build

FROM adoptopenjdk/openjdk11:alpine-jre

ENV FC_LANG en-US LC_CTYPE en_US.UTF-8

# dependencies
RUN apk upgrade & apk add --update-cache --no-cache bash ttf-dejavu fontconfig curl java-cacerts && \
    mkdir -p /app/certs && \
    curl https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem -o /app/certs/rds-combined-ca-bundle.pem  && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias aws-rds -file /app/certs/rds-combined-ca-bundle.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    curl https://cacerts.digicert.com/DigiCertGlobalRootG2.crt.pem -o /app/certs/DigiCertGlobalRootG2.crt.pem  && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias azure-cert -file /app/certs/DigiCertGlobalRootG2.crt.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    mkdir -p /plugins && chmod a+rwx /plugins

# add Metabase jar & add our run script to the image
COPY ./metabase.jar ./run_metabase.sh /app/

# expose our default runtime port
EXPOSE 3000

CMD ["/app/run_metabase.sh"]