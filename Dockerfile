###################
# STAGE 1: builder
###################

FROM --platform=linux/amd64 eclipse-temurin:11.0.12_7-jdk-focal as builder

ARG MB_EDITION=oss CI=true 

WORKDIR /app/

RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    # install Node LTS and Yarn from their repos
    && curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
    && apt-get update && apt-get upgrade -y && apt-get install -y git nodejs yarn \
    # installing Clojure CLI
    && curl -O https://download.clojure.org/install/linux-install-1.10.3.986.sh && chmod +x linux-install-1.10.3.986.sh && ./linux-install-1.10.3.986.sh \
    # downloading certs from AWS and Azure so we don't need to do it in the next step and only install those
    && mkdir /app/certs \
    && curl https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem -o /app/certs/rds-combined-ca-bundle.pem \
    && curl https://cacerts.digicert.com/DigiCertGlobalRootG2.crt.pem -o /app/certs/DigiCertGlobalRootG2.crt.pem

COPY . .
RUN INTERACTIVE=false CI=$CI MB_EDITION=$MB_EDITION bin/build

# ###################
# # STAGE 2: runner
# ###################

FROM eclipse-temurin:11.0.12_7-jre-focal as runner

ENV FC_LANG en-US LC_CTYPE en_US.UTF-8

WORKDIR /app/

COPY --from=builder /app/certs/. /app/certs/

# dependencies
# updating everything that doesn't come updated from previous layers
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ttf-dejavu && \
    # importing certs
    mkdir -p /etc/ssl/certs/java/cacerts  && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias aws-rds -file /app/certs/rds-combined-ca-bundle.pem -keystore /etc/ssl/certs/java/cacerts/java-keystore -keypass changeit -storepass changeit && \
    /opt/java/openjdk/bin/keytool -noprompt -import -trustcacerts -alias azure-cert -file /app/certs/DigiCertGlobalRootG2.crt.pem -keystore /etc/ssl/certs/java/cacerts/java-keystore -keypass changeit -storepass changeit && \
    # cleaning everything to reduce container size
    apt-get autoremove -y && apt-get autoclean && \
    rm -rf /var/lib/apt/lists/* && \
    # providing permissions to the nobody user
    chown -R nobody:nogroup /app

USER nobody
COPY --from=builder --chown=nobody /app/target/uberjar/metabase.jar /app/
COPY --chown=nobody bin/docker/run_metabase.sh /app/

# expose our default runtime port
EXPOSE 3000

# run it
ENTRYPOINT ["/app/run_metabase.sh"]