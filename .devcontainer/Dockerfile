ARG VARIANT=ubuntu-20.04
FROM mcr.microsoft.com/vscode/devcontainers/base:0-${VARIANT}

RUN apt update

RUN apt install -y gettext 
RUN apt install -y openjdk-8-jdk
RUN update-java-alternatives --set /usr/lib/jvm/java-1.8.0-openjdk-amd64
RUN apt install -y nodejs
RUN apt install -y npm
RUN apt install -y leiningen
RUN npm install --global yarn

# Installing Clojure
RUN curl -L -O https://github.com/clojure/brew-install/releases/latest/download/linux-install.sh
RUN chmod +x linux-install.sh
RUN ./linux-install.sh
RUN rm ./linux-install.sh