# Configuring Logging Level

By default, Metabase logs quite a bit of information. Luckily, Metabase uses [Log4j](http://logging.apache.org/log4j) under the hood, meaning the logging is completely configurable.

Metabase's default logging configuration can be found [here](https://github.com/metabase/metabase/blob/master/resources/log4j.properties). You can override this properties file and tell
Metabase to use your own logging configuration file by passing a `-Dlog4j.configuration` argument when running Metabase:

    java -Dlog4j.configuration=file:/path/to/custom/log4j.properties -jar metabase.jar

The easiest way to get started customizing logging would be to use a copy of default `log4j.properties` file linked to above and adjust that to meet your needs. Keep in mind that you'll need to restart Metabase for changes to the file to take effect.

# Configuring Emoji Logging

By default Metabase will include emoji characters in logs. You can disable this by using the following environment variable:

    export MB_EMOJI_IN_LOGS="false"
    java -jar metabase.jar
