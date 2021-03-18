###################
# STAGE 1.1: builder frontend
###################

FROM metabase/ci:java-11-lein-2.9.6-clj-1.10.3.822-04-22-2021 as frontend

WORKDIR /app/source

# frontend dependencies
COPY yarn.lock package.json .yarnrc ./
RUN yarn install --frozen-lockfile
# TODO: we should build the frontend here while the backend is getting deps, should be way faster than what we do today

###################
# STAGE 1.2: builder backend
###################

FROM metabase/ci:java-11-lein-2.9.6-clj-1.10.3.822-04-22-2021 as backend

WORKDIR /app/source

# backend dependencies
COPY project.clj .
RUN lein deps :tree

###################
# STAGE 1.3: main builder
###################

FROM metabase/ci:java-11-lein-2.9.6-clj-1.10.3.822-04-22-2021 as builder

ARG MB_EDITION=oss

WORKDIR /app/source

# try to reuse caching as much as possible
COPY --from=frontend /usr/local/share/.cache/yarn/. /usr/local/share/.cache/yarn/.
COPY --from=frontend /app/source/. .
COPY --from=backend /root/.m2/repository/. /root/.m2/repository/.
COPY --from=backend /app/source/. .

# add the rest of the source
COPY . .

# build the app
RUN INTERACTIVE=false MB_EDITION=$MB_EDITION bin/build

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
COPY --from=builder /app/source/target/uberjar/metabase.jar /app/
COPY bin/docker/run_metabase.sh /app/

# expose our default runtime port
EXPOSE 3000

# run it
CMD ["/app/run_metabase.sh"]