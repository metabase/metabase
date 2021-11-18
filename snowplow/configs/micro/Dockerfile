FROM snowplow/snowplow-micro
COPY ./configs /configs
EXPOSE 9095
CMD ["--collector-config", "/configs/micro.conf", "--iglu", "/configs/iglu.json"]
