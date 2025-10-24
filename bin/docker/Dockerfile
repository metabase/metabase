FROM eclipse-temurin:21-jre-alpine

ENV FC_LANG=en-US LC_CTYPE=en_US.UTF-8

ARG GIT_COMMIT_SHA
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

# dependencies
RUN apk add -U bash fontconfig curl font-noto font-noto-arabic font-noto-hebrew font-noto-cjk font-noto-thai java-cacerts && \
    apk upgrade && \
    rm -rf /var/cache/apk/* && \
    mkdir -p /app/certs && \
    curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /app/certs/rds-combined-ca-bundle.pem  && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias aws-rds -file /app/certs/rds-combined-ca-bundle.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    curl https://cacerts.digicert.com/DigiCertGlobalRootG2.crt.pem -o /app/certs/DigiCertGlobalRootG2.crt.pem  && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias azure-cert -file /app/certs/DigiCertGlobalRootG2.crt.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    mkdir -p /plugins && chmod a+rwx /plugins

# add Metabase jar & add our run script to the image
COPY ./metabase.jar ./run_metabase.sh /app/

# Also used as the group name
ARG USERNAME=metabase
ARG MGID=2000
ARG MUID=2000

RUN addgroup --gid $MGID --system $USERNAME \
    && adduser --disabled-password --uid $MUID --disabled-password --ingroup $USERNAME $USERNAME

# ensure writable directory exists for default H2 database location
RUN mkdir -p /metabase.db && chown $USERNAME:$USERNAME /metabase.db

USER $USERNAME

# expose our default runtime port
EXPOSE 3000

# run it
ENV MB_DB_FILE=/metabase.db/metabase.db
ENTRYPOINT ["/app/run_metabase.sh"]
