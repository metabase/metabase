# musl build of the static-viz JS isolate, see bin/docker/js-isolate/README.md
ARG JS_ISOLATE_IMAGE=metabase/graaljs-musl:25.1.3
FROM ${JS_ISOLATE_IMAGE} AS js-isolate

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

# the isolate must match the GraalVM version in metabase.jar
COPY --from=js-isolate / /app/js-isolate/
RUN jar_version="$(unzip -p /app/metabase.jar META-INF/graalvm/org.graalvm.truffle/version)" && \
    isolate_version="$(cat /app/js-isolate/VERSION)" && \
    if [ -z "$jar_version" ] || [ "$jar_version" != "$isolate_version" ]; then \
      echo "metabase.jar uses Truffle '${jar_version:-<unknown>}' but the JS isolate was built for '$isolate_version'; rebuild it (bin/docker/js-isolate)" >&2; \
      exit 1; \
    fi

# pre-extract libtruffleattach so isolates work without a writable $HOME
RUN case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64) arch=aarch64 ;; *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;; esac && \
    mkdir -p /app/truffle-attach/bin && \
    unzip -q -j /app/metabase.jar "META-INF/resources/engine/libtruffleattach/linux/$arch/bin/libtruffleattach.so" -d /app/truffle-attach/bin && \
    test -s /app/truffle-attach/bin/libtruffleattach.so && \
    unzip -p /app/metabase.jar META-INF/graalvm/org.graalvm.truffle/version > /app/truffle-attach/VERSION

# expose our default runtime port
EXPOSE 3000

# if you have an H2 database that you want to initialize the new Metabase
# instance with, mount it in the container as a volume that will match the
# pattern /app/initial*.db:
# $ docker run ... -v $PWD/metabase.db.mv.db:/app/initial.db.mv.db ...

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
