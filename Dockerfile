###################
# STAGE 1: builder
###################

FROM metabase/ci:circleci-java-11-clj-1.10.3.929-07-27-2021-node-browsers as builder

ARG MB_EDITION=oss

WORKDIR /home/circleci

COPY --chown=circleci . .
RUN INTERACTIVE=false CI=true MB_EDITION=$MB_EDITION bin/build

# ###################
# # STAGE 2: runner
# ###################

## Remember that this runner image needs to be the same as bin/docker/Dockerfile with the exception that this one grabs the
## jar from the previous stage rather than the local build

FROM eclipse-temurin:11-jre-alpine as runner

ENV FC_LANG en-US LC_CTYPE en_US.UTF-8

# dependencies
RUN apk add -U bash ttf-dejavu fontconfig curl java-cacerts && \
    apk upgrade && \
    rm -rf /var/cache/apk/* && \
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
