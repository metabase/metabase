FROM mcr.microsoft.com/vscode/devcontainers/java:11

RUN apt-key adv --refresh-keys --keyserver keyserver.ubuntu.com\
  && apt-get update && export DEBIAN_FRONTEND=noninteractive \
  && apt-get -y install --no-install-recommends yarn

RUN curl -fsSL https://deb.nodesource.com/setup_14.x | bash
RUN apt-get update && apt-get -y install --no-install-recommends nodejs

RUN curl -O https://download.clojure.org/install/linux-install-1.11.0.1100.sh \
  && bash ./linux-install-1.11.0.1100.sh
