FROM yukinying/chrome-headless-browser-stable:latest

ENV DEBIAN_FRONTEND=noninteractive

USER root

RUN dpkg --add-architecture amd64

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    xvfb && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app

ENV CYPRESS_VERSION=13.9.0
ARG BINARY_ARCHITECTURE=x64

RUN curl -L "https://download.cypress.io/desktop/${CYPRESS_VERSION}?platform=linux&arch=$BINARY_ARCHITECTURE" -o /tmp/cypress.zip
RUN mkdir -p /opt/cypress && \
    unzip /tmp/cypress.zip -d /opt/cypress && \
    rm /tmp/cypress.zip

ENTRYPOINT ["/bin/bash"]
