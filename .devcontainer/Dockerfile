FROM mcr.microsoft.com/vscode/devcontainers/java:21

# Set up nodesource, install node, yarn, fontconfig for static viz, rlwrap for dev ergonomics

RUN ( curl -fsSL https://deb.nodesource.com/setup_22.x | bash ) \
  && export DEBIAN_FRONTEND=noninteractive \
  && apt-key adv --refresh-keys --keyserver keyserver.ubuntu.com \
  && apt-get update && apt-get -y install --no-install-recommends nodejs yarn rlwrap fontconfig

# install Clojure
RUN curl https://download.clojure.org/install/linux-install-1.12.0.1488.sh | bash
