FROM snowplow/snowplow-micro
COPY ./configs/micro /usr/src
EXPOSE 9095
CMD ["--collector-config", "/usr/src/micro.conf", "--iglu", "/usr/src/iglu.json"]
