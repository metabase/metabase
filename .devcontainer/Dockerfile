FROM mcr.microsoft.com/devcontainers/javascript-node:18-bullseye

#install java on debian
RUN apt-get update && \
  apt-get install -y openjdk-11-jre curl

RUN ( curl -fsSL https://deb.nodesource.com/setup_18.x | bash ) \
  && export DEBIAN_FRONTEND=noninteractive \
  && apt-key adv --refresh-keys --keyserver keyserver.ubuntu.com \
  && apt-get update && apt-get -y install --no-install-recommends nodejs yarn rlwrap fontconfig

# install Clojure
RUN curl https://download.clojure.org/install/linux-install-1.11.1.1262.sh | bash

RUN curl -sLO https://raw.githubusercontent.com/clj-kondo/clj-kondo/master/script/install-clj-kondo && \
  chmod +x install-clj-kondo && \
  ./install-clj-kondo
