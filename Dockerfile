# musl build of the static-viz JS isolate, see bin/docker/js-isolate/README.md
ARG JS_ISOLATE_IMAGE=metabase/graaljs-musl:25.1.3

###################
# STAGE 1: builder
###################

FROM node:22-bullseye AS builder

ARG MB_EDITION=oss
ARG VERSION

WORKDIR /home/node

RUN apt-get update && apt-get upgrade -y && apt-get install wget apt-transport-https gpg curl git -y \
    && wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor | tee /etc/apt/trusted.gpg.d/adoptium.gpg > /dev/null \
    && echo "deb https://packages.adoptium.net/artifactory/deb $(awk -F= '/^VERSION_CODENAME/{print$2}' /etc/os-release) main" | tee /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt install temurin-25-jdk -y \
    && curl -O https://download.clojure.org/install/linux-install-1.12.0.1488.sh \
    && chmod +x linux-install-1.12.0.1488.sh \
    && ./linux-install-1.12.0.1488.sh \
    && curl -LsSf https://astral.sh/uv/install.sh | sh

ENV PATH="/root/.local/bin:$PATH"

COPY . .

# version is pulled from git, but git doesn't trust the directory due to different owners
RUN git config --global --add safe.directory /home/node

# install bun for frontend dependencies
RUN npm install -g bun

# install frontend dependencies
RUN bun install --frozen-lockfile

RUN INTERACTIVE=false CI=true MB_EDITION=$MB_EDITION bin/build.sh :version ${VERSION}

# ###################
# # STAGE 2: runner
# ###################

## Remember that this runner image needs to be the same as bin/docker/Dockerfile with the exception that this one grabs the
## jar from the previous stage rather than the local build

FROM ${JS_ISOLATE_IMAGE} AS js-isolate

FROM eclipse-temurin:25-jre-alpine AS runner

ENV FC_LANG=en-US LC_CTYPE=en_US.UTF-8

# copy certs before the RUN so keytool can import them
COPY bin/docker/DigiCertGlobalRootG2.crt.pem /app/certs/DigiCertGlobalRootG2.crt.pem

# dependencies
RUN apk add -U bash fontconfig curl font-noto font-noto-arabic font-noto-hebrew font-noto-cjk java-cacerts && \
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

COPY bin/docker/blocked.certs /app/certs/
RUN cat /app/certs/blocked.certs >> /opt/java/openjdk/lib/security/blocked.certs

# add Metabase script and uberjar
COPY --from=builder /home/node/target/uberjar/metabase.jar /app/
COPY bin/docker/run_metabase.sh /app/

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

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
