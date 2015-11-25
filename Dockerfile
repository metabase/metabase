FROM ubuntu:trusty

# Make sure we are using UTF-8
RUN locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

ENV DEBIAN_FRONTEND noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN true

# install core build tools
RUN apt-get update && \
    apt-get install -y openjdk-7-jdk && \
    apt-get install -y nodejs && \
    apt-get install -y npm && \
    apt-get install -y git && \
    apt-get install -y wget
ADD https://raw.github.com/technomancy/leiningen/stable/bin/lein /usr/local/bin/lein
RUN chmod 744 /usr/local/bin/lein

# little bit of cleanup so that our build process will work
ENV PATH /usr/local/bin:$PATH
ENV LEIN_ROOT 1
RUN ln -s /usr/bin/nodejs /usr/bin/node

# add the application source to the image
ADD . /app/source

# build the app
WORKDIR /app/source
RUN bin/build

# expose our default runtime port
EXPOSE 3000

# build and then run it
WORKDIR /app/source
ENTRYPOINT ["./bin/start"]
