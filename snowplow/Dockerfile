FROM snowplow/snowplow-micro
COPY ./configs /configs
CMD ["--collector-config", "/configs/micro.conf", "--iglu", "/configs/iglu.json"]
