FROM mcr.microsoft.com/vscode/devcontainers/java:11

RUN apt-key adv --refresh-keys --keyserver keyserver.ubuntu.com\
  && apt-get update && export DEBIAN_FRONTEND=noninteractive \
  && apt-get -y install --no-install-recommends leiningen yarn

RUN curl -fsSL https://deb.nodesource.com/setup_14.x | bash
RUN apt-get update && apt-get -y install --no-install-recommends nodejs