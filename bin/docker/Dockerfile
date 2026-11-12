# musl build of the static-viz JS isolate, see bin/docker/js-isolate/README.md
ARG JS_ISOLATE_IMAGE=metabase/graaljs-isolate-musl:25.1.3
FROM ${JS_ISOLATE_IMAGE} AS js-isolate

# static-viz files for /app, prepared here so the runner only copies them in. Same as in the root Dockerfile.
FROM eclipse-temurin:25-jre-alpine AS static-viz

COPY ./metabase.jar /tmp/metabase.jar
COPY --from=js-isolate / /out/js-isolate/
COPY prepare-static-viz.sh /tmp/
RUN /tmp/prepare-static-viz.sh /tmp/metabase.jar /out

FROM eclipse-temurin:25-jre-alpine

ENV FC_LANG=en-US LC_CTYPE=en_US.UTF-8

ARG GIT_COMMIT_SHA
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

# copy cert before RUN so keytool can import it
COPY DigiCertGlobalRootG2.crt.pem /app/certs/DigiCertGlobalRootG2.crt.pem

# dependencies
RUN apk add -U bash fontconfig curl font-noto font-noto-arabic font-noto-hebrew font-noto-cjk font-noto-thai java-cacerts && \
    apk upgrade && \
    rm -rf /var/cache/apk/* && \
    sed -i 's|^mozilla/emSign_ECC_Root_CA_-_G3.crt|!&|' /etc/ca-certificates.conf && \
    update-ca-certificates && \
    /opt/java/openjdk/bin/keytool -list -v -cacerts -storepass changeit | awk '/^Alias name:/{a=substr($0,13)} /^Owner: CN=emSign ECC Root CA - G3,/{print a}' | while read -r a; do /opt/java/openjdk/bin/keytool -delete -cacerts -storepass changeit -alias "$a"; done && \
    mkdir -p /app/certs && \
    curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /app/certs/rds-combined-ca-bundle.pem  && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias aws-rds -file /app/certs/rds-combined-ca-bundle.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias azure-cert -file /app/certs/DigiCertGlobalRootG2.crt.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    mkdir -p /plugins && chmod a+rwx /plugins

COPY blocked.certs /app/certs/
RUN cat /app/certs/blocked.certs >> /opt/java/openjdk/lib/security/blocked.certs

# add Metabase jar & add our run script to the image
COPY ./metabase.jar ./run_metabase.sh /app/
COPY --from=static-viz /out/ /app/

# expose our default runtime port
EXPOSE 3000

# if you have an H2 database that you want to initialize the new Metabase
# instance with, mount it in the container as a volume that will match the
# pattern /app/initial*.db:
# $ docker run ... -v $PWD/metabase.db.mv.db:/app/initial.db.mv.db ...

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
