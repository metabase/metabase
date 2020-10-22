###################
# STAGE 1: builder
###################

# Build currently doesn't work on > Java 11 (i18n utils are busted) so build on 8 until we fix this
FROM adoptopenjdk/openjdk8:alpine as builder

WORKDIR /app/source

ENV FC_LANG en-US
ENV LC_CTYPE en_US.UTF-8

# bash:    various shell scripts
# wget:    installing lein (TODO -- is this actually needed? We don't use wget directly)
# curl:    needed by script that installs Clojure CLI
# git:     ./bin/version
# yarn:    frontend building
# make:    backend building (TODO -- huh? We don't use Make to build the backend)
# gettext: translations
# java-cacerts: installs updated cacerts to /etc/ssl/certs/java/cacerts

RUN apk add --no-cache coreutils bash yarn git wget curl make gettext java-cacerts

# lein:    backend dependencies and building
ADD https://raw.github.com/technomancy/leiningen/stable/bin/lein /usr/local/bin/lein
RUN chmod 744 /usr/local/bin/lein
RUN lein upgrade

# Clojure CLI (needed for some build scripts)
ADD https://download.clojure.org/install/linux-install-1.10.1.708.sh /tmp/linux-install-1.10.1.708.sh
RUN chmod +x /tmp/linux-install-1.10.1.708.sh
RUN /tmp/linux-install-1.10.1.708.sh

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
ADD https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem .
RUN keytool -noprompt -import -trustcacerts -alias aws-rds \
  -file rds-combined-ca-bundle.pem \
  -keystore /etc/ssl/certs/java/cacerts \
  -keypass changeit -storepass changeit

# ###################
# # STAGE 2: runner
# ###################

FROM adoptopenjdk/openjdk11:alpine-jre as runner

WORKDIR /app

ENV FC_LANG en-US
ENV LC_CTYPE en_US.UTF-8

# dependencies
RUN apk add --no-cache bash ttf-dejavu fontconfig

# add fixed cacerts
COPY --from=builder /etc/ssl/certs/java/cacerts /opt/java/openjdk/lib/security/cacerts

# add Metabase script and uberjar
RUN mkdir -p bin target/uberjar
COPY --from=builder /app/source/target/uberjar/metabase.jar /app/target/uberjar/
COPY --from=builder /app/source/bin/start /app/bin/

# create the plugins directory, with writable permissions
RUN mkdir -p /plugins
RUN chmod a+rwx /plugins

# expose our default runtime port
EXPOSE 3000

# run it
ENTRYPOINT ["/app/bin/start"]
