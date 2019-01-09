###################
# STAGE 1: builder
###################

FROM java:openjdk-8-jdk-alpine as builder

WORKDIR /app/source

ENV FC_LANG en-US
ENV LC_CTYPE en_US.UTF-8

# bash:    various shell scripts
# wget:    installing lein
# git:     ./bin/version
# nodejs:  frontend building
# make:    backend building
# gettext: translations
RUN apk add --update bash nodejs git wget make gettext

ADD . /app/source

# import Crossdata and defaultSecrets
RUN mkdir /root/.crossdata/ && \
    mkdir /root/defaultsecrets/ && \
    mv /app/source/resources/security/* /root/defaultsecrets/. && \
    mkdir /root/kms/ && \
    mv  /app/source/resources/kms/* /root/kms/.

ENV MAVEN_VERSION="3.2.5" \
    M2_HOME=/usr/lib/mvn

# To generate local docker, comment mvn dependency:get and mv. Download jar in ./bin/lib/
# http://qa.stratio.com/repository/releases/com/stratio/jdbc/stratio-crossdata-jdbc4/2.13.4-cb4ebcf/stratio-crossdata-jdbc4-2.13.4-cb4ebcf.jar
RUN apk add --update wget && \
    cd /tmp && \
    wget "http://ftp.unicamp.br/pub/apache/maven/maven-3/$MAVEN_VERSION/binaries/apache-maven-$MAVEN_VERSION-bin.tar.gz" && \
    tar -zxvf "apache-maven-$MAVEN_VERSION-bin.tar.gz" && \
    mv "apache-maven-$MAVEN_VERSION" "$M2_HOME" && \
    ln -s "$M2_HOME/bin/mvn" /usr/bin/mvn && \
    mvn package -f /app/source/local-query-execution-factory/pom.xml && \
    mv /app/source/local-query-execution-factory/target/local-query-execution-factory-0.2.jar /app/source/bin/lib/local-query-execution-factory-0.2.jar && \
    mvn install:install-file -Dfile=/app/source/bin/lib/local-query-execution-factory-0.2.jar -DgroupId=com.stratio.metabase -DartifactId=local-query-execution-factory -Dversion=0.2 -Dpackaging=jar && \
    mvn dependency:get -DgroupId=com.stratio.jdbc -DartifactId=stratio-crossdata-jdbc4 -Dversion=2.13.4-cb4ebcf -DremoteRepositories=http://sodio.stratio.com/repository/public/ -Dtransitive=false && \
    mv /root/.m2/repository/com/stratio/jdbc/stratio-crossdata-jdbc4/2.13.4-cb4ebcf/stratio-crossdata-jdbc4-2.13.4-cb4ebcf.jar /app/source/bin/lib/stratio-crossdata-jdbc4-2.13.4-cb4ebcf.jar && \
    mvn install:install-file -Dfile=/app/source/bin/lib/stratio-crossdata-jdbc4-2.13.4-cb4ebcf.jar -DgroupId=com.stratio.jdbc -DartifactId=stratio-crossdata-jdbc4 -Dversion=2.13.4-cb4ebcf -Dpackaging=jar

# yarn:    frontend dependencies
RUN npm install -g yarn

# lein:    backend dependencies and building
ADD https://raw.github.com/technomancy/leiningen/stable/bin/lein /usr/local/bin/lein
RUN chmod 744 /usr/local/bin/lein
RUN lein upgrade

# install dependencies before adding the rest of the source to maximize caching

# backend dependencies
ADD project.clj .
RUN lein deps

# frontend dependencies
ADD yarn.lock package.json ./
RUN yarn --ignore-engines

# add the rest of the source
ADD . .

# build the app
RUN bin/build

# install updated cacerts to /etc/ssl/certs/java/cacerts
RUN apk add --update java-cacerts

# import AWS RDS cert into /etc/ssl/certs/java/cacerts
ADD https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem .
RUN keytool -noprompt -import -trustcacerts -alias aws-rds \
  -file rds-combined-ca-bundle.pem \
  -keystore /etc/ssl/certs/java/cacerts \
  -keypass changeit -storepass changeit


# ###################
# # STAGE 2: runner
# ###################

FROM java:openjdk-8-jre-alpine as runner

WORKDIR /app

ENV FC_LANG en-US
ENV LC_CTYPE en_US.UTF-8

# dependencies
RUN apk add --update bash ttf-dejavu fontconfig && \
    apk add --update curl && \
    apk add --update jq && \
    apk add --update openssl && \
    rm -rf /var/cache/apk/*

# add fixed cacerts
COPY --from=builder /etc/ssl/certs/java/cacerts /usr/lib/jvm/default-jvm/jre/lib/security/cacerts

# add Metabase script and uberjar
RUN mkdir -p bin target/uberjar && \
    mkdir -p bin /root/.crossdata/
COPY --from=builder /app/source/target/uberjar/metabase.jar /app/target/uberjar/
COPY --from=builder /app/source/bin/start /app/bin/
COPY --from=builder /app/source/resources/log4j2.xml /app/target/log/
COPY --from=builder /root/defaultsecrets/* /root/defaultsecrets/
COPY --from=builder /root/kms/* /root/kms/

# expose our default runtime port
EXPOSE 3000

# run it
ENTRYPOINT ["/app/bin/start"]
