###################
# STAGE 1.1: builder frontend
###################

FROM metabase/ci:circleci-java-11-clj-1.10.3.929-07-27-2021-node-browsers as frontend

ARG MB_EDITION=oss

WORKDIR /home/circleci

COPY --chown=circleci . .
RUN NODE_ENV=production MB_EDITION=$MB_EDITION yarn --frozen-lockfile && \
    yarn build && yarn build-static-viz && bin/i18n/build-translation-resources

###################
# STAGE 1.4: main builder
###################

FROM metabase/ci:circleci-java-11-clj-1.10.3.929-07-27-2021-node-browsers as builder

ARG MB_EDITION=oss

WORKDIR /home/circleci

# try to reuse caching as much as possible
COPY --from=frontend /home/circleci/.m2/repository/. /home/circleci/.m2/repository/.
COPY --from=frontend /home/circleci/. .

# build the app
RUN INTERACTIVE=false MB_EDITION=$MB_EDITION bin/build version drivers uberjar

# ###################
# # STAGE 2: runner
# ###################

## Remember that this runner image needs to be the same as bin/docker/Dockerfile with the exception that this one grabs the
## jar from the previous stage rather than the local build

FROM adoptopenjdk/openjdk11:alpine-jre as runner

ENV FC_LANG en-US LC_CTYPE en_US.UTF-8

# dependencies
RUN apk upgrade && apk add --update-cache --no-cache bash ttf-dejavu fontconfig curl java-cacerts && \
    mkdir -p /app/certs && \
    curl https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem -o /app/certs/rds-combined-ca-bundle.pem  && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias aws-rds -file /app/certs/rds-combined-ca-bundle.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    curl https://cacerts.digicert.com/DigiCertGlobalRootG2.crt.pem -o /app/certs/DigiCertGlobalRootG2.crt.pem  && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias azure-cert -file /app/certs/DigiCertGlobalRootG2.crt.pem -keystore /etc/ssl/certs/java/cacerts -keypass changeit -storepass changeit && \
    mkdir -p /plugins && chmod a+rwx /plugins

# add Metabase script and uberjar
COPY --from=builder /home/circleci/target/uberjar/metabase.jar /app/
COPY bin/docker/run_metabase.sh /app/

# expose our default runtime port
EXPOSE 3000

# run it
ENTRYPOINT ["/app/run_metabase.sh"]
