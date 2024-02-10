FROM mcr.microsoft.com/vscode/devcontainers/java:11

# Set up nodesource, install node, yarn, fontconfig for static viz, rlwrap for dev ergonomics

RUN ( curl -fsSL https://deb.nodesource.com/setup_18.x | bash ) \
  && export DEBIAN_FRONTEND=noninteractive \
  && apt-key adv --refresh-keys --keyserver keyserver.ubuntu.com \
  && apt-get update && apt-get -y install --no-install-recommends nodejs yarn rlwrap fontconfig

# install Clojure
RUN curl https://download.clojure.org/install/linux-install-1.11.1.1262.sh | bash
