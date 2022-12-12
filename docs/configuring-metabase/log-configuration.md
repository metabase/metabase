---
title: Metabase logs
redirect_from:
  - /docs/latest/operations-guide/log-configuration
---

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

    <!-- Example: Add trace logging to the Metabase analysis process, which can help debugging trouble with syncing, fingerprinting and scanning -->
    <Logger name="metabase.sync" level="TRACE"/>

    <Root level="WARN">
      <AppenderRef ref="STDOUT"/>
    </Root>
</Loggers>
```

Check out [How to read the logs][read-logs].

## Jetty logs

You can configure Metabase's web server to provide more detail in the logs by setting the log level to `DEBUG`. Just keep in mind that Jetty's debug logs can be really chatty, which can make it difficult to find the data you're looking for.

To get Jetty logs, add the following lines to the Log4J2 XML file in the <Loggers> node:

```
<Logger name="org.eclipse.jetty" level="DEBUG"/>
```

## Using Log4j 2 with Docker

Before running the Metabase Docker image, you'll need to pass the custom `log4j.configurationFile` argument. Add a `JAVA_OPTS=-Dlog4j.configurationFile=file:/path/to/custom/log4j2.xml` to the environment variables of the container, like this:

```
docker run -p 3000:3000 -v $PWD/my_log4j2.xml:/tmp/my_log4j2.xml -e JAVA_OPTS=-Dlog4j.configurationFile=file:///tmp/my_log4j2.xml metabase/metabase`
```

## Disable emoji or colorized logging

By default Metabase will include emoji characters in logs. You can disable emoji by using the `MB_EMOJI_IN_LOGS` environment variable:

### Configuring Emoji Logging

```
export MB_EMOJI_IN_LOGS="false"
java -jar metabase.jar
```

[default-log-config]: https://github.com/metabase/metabase/blob/master/resources/log4j2.xml
[levels]: https://logging.apache.org/log4j/2.x/manual/customloglevels.html
[log4j]: https://logging.apache.org/log4j/2.x/
[read-logs]: ../troubleshooting-guide/server-logs.md
