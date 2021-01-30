###################
# STAGE 1: builder
###################

# Build currently doesn't work on > Java 11 (i18n utils are busted) so build on 8 until we fix this
FROM adoptopenjdk/openjdk8:alpine as builder

WORKDIR /app/source

ENV FC_LANG en-US LC_CTYPE en_US.UTF-8

# bash:    various shell scripts
# curl:    needed by script that installs Clojure CLI
# git:     ./bin/version
# yarn:    frontend building
# gettext: translations
# java-cacerts: installs updated cacerts to /etc/ssl/certs/java/cacerts

RUN apk add --no-cache coreutils bash yarn git curl gettext java-cacerts

# lein:    backend dependencies and building
RUN curl https://raw.githubusercontent.com/technomancy/leiningen/stable/bin/lein -o /usr/local/bin/lein && \
  chmod +x /usr/local/bin/lein && \
  /usr/local/bin/lein upgrade

# Clojure CLI (needed for some build scripts)
RUN curl https://download.clojure.org/install/linux-install-1.10.1.708.sh -o /tmp/linux-install-1.10.1.708.sh && \
  chmod +x /tmp/linux-install-1.10.1.708.sh && \
  sh /tmp/linux-install-1.10.1.708.sh

# install dependencies before adding the rest of the source to maximize caching

# backend dependencies
COPY project.clj .
RUN lein deps

# frontend dependencies
COPY yarn.lock package.json .yarnrc ./
RUN yarn

# add the rest of the source
COPY . .

# build the app
RUN INTERACTIVE=false bin/build

# import AWS RDS cert into /etc/ssl/certs/java/cacerts
RUN curl https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem -o rds-combined-ca-bundle.pem  && \
  /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias aws-rds \
  -file rds-combined-ca-bundle.pem \
  -keystore /etc/ssl/certs/java/cacerts \
  -keypass changeit -storepass changeit

# ###################
# # STAGE 2: runner
# ###################

FROM adoptopenjdk/openjdk11:alpine-jre as runner

WORKDIR /app

ENV FC_LANG en-US LC_CTYPE en_US.UTF-8

# dependencies
RUN apk -U upgrade && apk add --no-cache bash ttf-dejavu fontconfig

# add fixed cacerts
COPY --from=builder /etc/ssl/certs/java/cacerts /opt/java/openjdk/lib/security/cacerts

# add Metabase script and uberjar
RUN mkdir -p bin target/uberjar
COPY --from=builder /app/source/target/uberjar/metabase.jar /app/target/uberjar/
COPY --from=builder /app/source/bin/start /app/bin/

# create the plugins directory, with writable permissions
RUN mkdir -p /plugins && chmod a+rwx /plugins

# expose our default runtime port
EXPOSE 3000

# run it
ENTRYPOINT ["/app/bin/start"]
