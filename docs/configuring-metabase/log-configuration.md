---
title: Metabase logs
redirect_from:
  - /docs/latest/operations-guide/log-configuration
summary: Configure how much information Metabase displays in its logs.
---

# Metabase logs

Metabase logs quite a bit of information by default. Metabase uses [Log4j 2](https://logging.apache.org/log4j/2.x/) under the hood, so you can configure how much information Metabase logs.

## View and download Metabase logs

You can find Metabase logs in **Admin settings** > **Tools** > **Logs**. You can filter the logs by keywords (for example, "sync") and download them as a text file.

If you're running self-hosted Metabase, you'll also be able see the logs in the terminal.

## How to read Metabase logs

See [How to read logs](../troubleshooting-guide/server-logs.md).

## Configuring logging Level

Metabase uses [log4j](https://logging.apache.org/log4j/2.x/)for logging configuration. Here is Metabase's [default logging configuration](https://github.com/metabase/metabase/blob/master/resources/log4j2.xml). Some troubleshooting tasks might require you to override this logging configuration (for example, to see more details about errors). See Log4j's docs for info on [log levels](https://logging.apache.org/log4j/2.x/manual/customloglevels.html).

### Temporary override logging configuration

To temporarily adjust the logging configuration, go to **Admin settings** > **Tools** > **Logs** and click on **Customize log levels**.

You can select from log level presets for common troubleshooting tasks (for example, troubleshooting sync issues), or provide your own configuration as a JSON. For example, here's an override configuration that increases logging for troubleshooting linked filters:

```json
{
  "metabase.parameters.chain-filter": "debug",
  "metabase.parameters.chain-filter.dedupe-joins": "debug"
}
```

The override from Admin settings will be temporary. You can select for how long the override should be in place (e.g., 60 minutes). When the override times out, the logging configuration will revert to the default logging configuration (or a custom configuration if you're using a [custom log file](#use-a-custom-log-configuration-file)).

### Use a custom log configuration file

You can point Metabase to a custom log configuration file.

1. Make a [copy of the default `log4j2.xml` file](https://github.com/metabase/metabase/blob/master/resources/log4j2.xml)
2. Adjust it to meet your needs.

   You can set different log levels for different areas of the application, e.g.,:

```
<Loggers>
    <Logger name="metabase" level="INFO"/>
    <Logger name="metabase-enterprise" level="INFO"/>
    <Logger name="metabase.plugins" level="DEBUG"/>
    <Logger name="metabase.server.middleware" level="DEBUG"/>
    <Logger name="com.mchange" level="ERROR"/>

    <!-- Example: Add trace logging to the Metabase analysis process, which can help debugging trouble with syncing, fingerprinting and scanning -->
    <Logger name="metabase.sync" level="TRACE"/>

    <Root level="WARN">
      <AppenderRef ref="STDOUT"/>
    </Root>
</Loggers>
```

3. Stop your Metabase and start it again using the custom log configuration file:

- If you're running Metabase in Docker, you can point Metabase to your custom log file using an environment variable, `JAVA_OPTS=-Dlog4j.configurationFile=file:/path/to/custom/log4j2.xml`:

```
docker run -p 3000:3000 -v $PWD/my_log4j2.xml:/tmp/my_log4j2.xml -e JAVA_OPTS=-Dlog4j.configurationFile=file:/tmp/my_log4j2.xml metabase/metabase`
```

- If you're running Metabase as a JAR file, you can pass a `-Dlog4j.configurationFile` argument. For example, if your custom XML file is found in `/path/to/custom/log4j2.xml`, you can use it like so:

```
java -Dlog4j.configurationFile=file:/path/to/custom/log4j2.xml -jar metabase.jar
```

## Configure Jetty logs

You can configure Metabase's web server to provide more detail in the logs by setting the log level to `DEBUG`. Just keep in mind that Jetty's debug logs can be chatty, which can make it difficult to find the data you're looking for.

To get Jetty logs, add the following lines to the Log4J2 XML file in the <Loggers> node:

```
<Logger name="org.eclipse.jetty" level="DEBUG"/>
```

## Configure how logs are displayed

### Turn off emojis in logs

By default Metabase will include emoji characters in logs, like this:

```
2025-06-10 21:43:00,243 INFO sync.analyze :: classify-tables Analyzed [*****************************************·········] 😊   84% Table 6 ''PUBLIC.ACCOUNTS'' {mb-quartz-job-type=SyncAndAnalyzeDatabase}
2025-06-10 21:43:00,244 INFO sync.analyze :: classify-tables Analyzed [***********************************************···] 😎   96% Table 2 ''PUBLIC.ORDERS'' {mb-quartz-job-type=SyncAndAnalyzeDatabase}

```

You can disable emoji using the [`MB_EMOJI_IN_LOGS` environment variable](../configuring-metabase/environment-variables.md#mb_emoji_in_logs):

```
export MB_EMOJI_IN_LOGS="false"
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar
```

### Turn off colorized logs

By default, Metabase will use color when displaying logs (both in the Admin **Logs** and in the terminal). You can disable colorized logs using the [`MB_COLORIZE_LOGS` environment variable](../configuring-metabase/environment-variables.md#mb_colorize_logs).
