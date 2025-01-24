FROM openjdk:11-jdk-slim AS openjdk

FROM yukinying/chrome-headless-browser-stable:latest

ENV DEBIAN_FRONTEND=noninteractive

USER root

RUN dpkg --add-architecture amd64

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g yarn && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ca-certificates-java \
    python3 \
    make \
    xvfb \
    gcc \
    g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=openjdk /usr/local/openjdk-11 /usr/lib/jvm/java-11-openjdk-amd64

ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH=$JAVA_HOME/bin:$PATH

WORKDIR /app

COPY . .

RUN yarn --frozen-lockfile

ENTRYPOINT ["/bin/bash"]
