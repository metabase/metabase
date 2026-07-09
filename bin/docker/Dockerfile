FROM eclipse-temurin:21-jre-alpine

ENV FC_LANG=en-US LC_CTYPE=en_US.UTF-8

ARG GIT_COMMIT_SHA
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

# copy cert before RUN so keytool can import it
COPY DigiCertGlobalRootG2.crt.pem /app/certs/DigiCertGlobalRootG2.crt.pem

# dependencies
RUN apk add -U bash fontconfig curl font-noto font-noto-arabic font-noto-hebrew font-noto-cjk font-noto-thai java-cacerts nodejs && \
    apk upgrade && \
    rm -rf /var/cache/apk/* && \
    mkdir -p /app/certs && \
    curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /app/certs/rds-combined-ca-bundle.pem  && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias aws-rds -file /app/certs/rds-combined-ca-bundle.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias azure-cert -file /app/certs/DigiCertGlobalRootG2.crt.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    mkdir -p /plugins && chmod a+rwx /plugins

# add Metabase jar & add our run script to the image
COPY ./metabase.jar ./run_metabase.sh /app/

# extract the static-viz Node entrypoint from the jar (so it always matches the jar), owned by root:
# the metabase user can read but not modify what `node` executes when MB_STATIC_VIZ_MODE=node
RUN unzip -p /app/metabase.jar frontend_client/app/dist/app-static-viz-cli.bundle.js > /app/app-static-viz-cli.bundle.js
ENV MB_STATIC_VIZ_NODE_SCRIPT_PATH=/app/app-static-viz-cli.bundle.js

# expose our default runtime port
EXPOSE 3000

# if you have an H2 database that you want to initialize the new Metabase
# instance with, mount it in the container as a volume that will match the
# pattern /app/initial*.db:
# $ docker run ... -v $PWD/metabase.db.mv.db:/app/initial.db.mv.db ...

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
