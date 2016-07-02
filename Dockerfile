FROM java:openjdk-7-jre-alpine

ENV JAVA_HOME=/usr/lib/jvm/default-jvm
ENV PATH /usr/local/bin:$PATH
ENV LEIN_ROOT 1

ENV FC_LANG en-US
ENV LC_CTYPE en_US.UTF-8

# install core build tools
RUN apk add --update nodejs git wget bash python make g++ java-cacerts ttf-dejavu fontconfig && \
    npm install -g npm@2 && \
    ln -sf "${JAVA_HOME}/bin/"* "/usr/bin/"

# fix broken cacerts
RUN rm -f /usr/lib/jvm/default-jvm/jre/lib/security/cacerts && \
    ln -s /etc/ssl/certs/java/cacerts /usr/lib/jvm/default-jvm/jre/lib/security/cacerts

# install lein
ADD https://raw.github.com/technomancy/leiningen/stable/bin/lein /usr/local/bin/lein
RUN chmod 744 /usr/local/bin/lein

# add the application source to the image
ADD . /app/source

# build the app
WORKDIR /app/source
RUN bin/build

# remove unnecessary packages & tidy up
RUN apk del nodejs git wget python make g++
RUN rm -rf /root/.lein /root/.m2 /root/.node-gyp /root/.npm /tmp/* /var/cache/apk/* /app/source/node_modules

# expose our default runtime port
EXPOSE 3000

# build and then run it
WORKDIR /app/source
ENTRYPOINT ["./bin/start"]
