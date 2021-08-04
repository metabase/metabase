# Metabase logs

Metabase logs quite a bit of information by default. It uses [Log4j 2][log4j] under the hood, so you can configure how much information Metabase logs.

## Configuring Logging Level

Here is Metabase's [default logging configuration][default-log-config]. You can override this XML file and tell Metabase to use your own logging configuration file by passing a `-Dlog4j.configurationFile` argument when running Metabase. For example, if your custom XML file is found in `/path/to/custom/log4j2.xml`, you can use it like so:

```
java -Dlog4j.configurationFile=file:/path/to/custom/log4j2.xml -jar metabase.jar
```

To get started customizing the logs, make a [copy of the default `log4j2.xml` file][default-log-config] and adjust it to meet your needs. You'll need to restart Metabase for changes to the file to take effect. See Log4j's docs for info on [log levels][levels].

You can set different log levels for different areas of the application, e.g.,:

```
<Loggers>
    <Logger name="metabase" level="INFO"/>
    <Logger name="metabase-enterprise" level="INFO"/>
    <Logger name="metabase.plugins" level="DEBUG"/>
    <Logger name="metabase.server.middleware" level="DEBUG"/>
    <Logger name="metabase.query-processor.async" level="DEBUG"/>
    <Logger name="com.mchange" level="ERROR"/>

    <!-- Example: Add trace logging to the Metabase analysis process, which can help debugging troubles with syncing, fingerprinting and scanning -->
    <Logger name="metabase.sync" level="TRACE"/>

    <Root level="WARN">
      <AppenderRef ref="STDOUT"/>
    </Root>
</Loggers> 
```

Check out [How to read the logs][read-logs].

## Using Log4j 2 with Docker

When using containers, logs MUST be written into the /metabase.db directory. It's the only directory the Metabase user can write to (the user here being the one that executes the Metabase JAR inside the container).

Before running the Metabase Docker image, you'll need to pass the custom `log4j.configurationFile` argument. Add a `JAVA_OPTS=-Dlog4j.configurationFile=file:/path/to/custom/log4j2.xml` to the environment variables of the container, like this:

```
docker run -p 3000:3000 -v $PWD/logging_config:/metabase.db -e JAVA_OPTS=-Dlog4j.configurationFile=file:///metabase.db/log4j2.xml metabase/metabase`
```

When using docker-compose:

```
metabase:
    image: metabase/metabase:v0.37.4
    container_name: metabase
    hostname: metabase
    volumes: 
    - /dev/urandom:/dev/random:ro
    - $PWD/logging_config:/metabase.db
    ports:
      - 3000:3000
    environment: 
      - "JAVA_OPTS=-Dlog4j.configurationFile=file:///metabase.db/log4j2.xml"
```

## Disable emoji or colorized logging

By default Metabase will include emoji characters in logs. You can disable emoji by using the `MB_EMOJIN_IN_LOGS` environment variable:

```
export MB_EMOJI_IN_LOGS="false"
java -jar metabase.jar
```

[default-log-config]: https://github.com/metabase/metabase/blob/master/resources/log4j2.xml
[levels]: https://logging.apache.org/log4j/2.x/manual/customloglevels.html
[log4j]: https://logging.apache.org/log4j/2.x/
[read-logs]: ../troubleshooting-guide/server-logs.html 
