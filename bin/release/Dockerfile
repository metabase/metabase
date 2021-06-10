# -*- mode: dockerfile; coding: utf-8; -*-

FROM adoptopenjdk/openjdk11:alpine-jre

LABEL maintainer="Cam Saul <cam@metabase.com>"

WORKDIR /metabase

ENV FC_LANG en-US LC_CTYPE en_US.UTF-8

RUN apk upgrade && apk add --update-cache --no-cache aws-cli bash coreutils curl docker git java-cacerts nodejs openssh-client wget yarn zip

# Install Leiningen
ADD https://raw.github.com/technomancy/leiningen/stable/bin/lein /usr/local/bin/lein
RUN chmod 744 /usr/local/bin/lein
RUN lein upgrade

# Install Clojure CLI
ADD https://download.clojure.org/install/linux-install-1.10.1.727.sh /tmp/linux-install-1.10.1.727.sh
RUN chmod +x /tmp/linux-install-1.10.1.727.sh
RUN /tmp/linux-install-1.10.1.727.sh

# Copy Metabase source
COPY . /metabase

ENTRYPOINT ["/metabase/bin/release.sh"]
