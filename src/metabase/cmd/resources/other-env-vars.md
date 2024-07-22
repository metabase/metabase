
The following environment variables can only be set via the environment. They cannot be set by the configuration file.

### `MAX_SESSION_AGE`

Type: integer<br>
Default: `20160`

Session expiration, defined in minutes (default is 2 weeks), which will log out users after the defined period and require re-authentication.

Note: This setting is not an idle/inactivity timeout. If you set this to 15 minutes, your users have to login (or re-authenticate) again every 15 minutes. Use [MB_SESSION_TIMEOUT](#mb_session_timeout) to control timeout based on inactivity.

Use [MB_SESSION_COOKIES](#mb_session_cookies) to also expire sessions, when browser is closed.

Also see the [Changing session expiration](../people-and-groups/changing-session-expiration.md) documentation page.

### `MB_APPLICATION_DB_MAX_CONNECTION_POOL_SIZE`

Type: integer<br>
Default: `15`<br>
Since: v35.0

Maximum number of connections to the Metabase application database.

Change this to a higher value if you notice that regular usage consumes all or close to all connections. When all connections are in use, Metabase might feel slow or unresponsive when clicking around the interface.

To see how many connections are being used, check the Metabase logs and look for lines that contains the following: `… App DB connections: 12/15 …`. In this example, 12 out of 15 available connections are being used.

See [MB_JDBC_DATA_WAREHOUSE_MAX_CONNECTION_POOL_SIZE](#mb_jdbc_data_warehouse_max_connection_pool_size) for setting maximum connections to the databases connected to Metabase.

### `MB_ASYNC_QUERY_THREAD_POOL_SIZE`

Type: integer<br>
Default: `50`<br>
Since: v35.0

Maximum number of async Jetty threads. If not set, then [MB_JETTY_MAXTHREADS](#mb_jetty_maxthreads) will be used, otherwise it will use the default.

### `MB_AUDIT_MAX_RETENTION_DAYS`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: integer<br>
Default: 720 (Metabase keeps all rows)<br>

Sets the maximum number of days Metabase preserves rows for the following application database tables:

- `query_execution`
- `audit_log`
- `view_log`

Twice a day, Metabase will delete rows older than this threshold.

The minimum value is `30` days (Metabase will treat entered values of `1` to `29` the same as `30`). If set to `0`, Metabase will keep all rows.

### `MB_COLORIZE_LOGS`

Type: boolean<br>
Default: `true`

Color log lines. When set to `false` it will disable log line colors. This is disabled on Windows. Related to [MB_EMOJI_IN_LOGS](#mb_emoji_in_logs).

### `MB_CONFIG_FILE_PATH`

Type: string<br>
Default: `config.yml`

This feature requires the `config-text-file` feature flag on your token.

### `MB_CUSTOM_GEOJSON_ENABLED`

Type: boolean<br>
Default: `true`

Whether or not the use of custom GeoJSON is enabled.

### `MB_DB_AUTOMIGRATE`

Type: boolean<br>
Default: `true`

When set to `false`, Metabase will print migrations needed to be done in the application database and exit. Those migrations need to be applied manually. When `true`, Metabase will automatically make changes to the application database. This is not related to migrating away from H2.

### `MB_DB_CONNECTION_URI`

Type: string<br>
Default: `null`

A JDBC-style connection URI that can be used instead of most of `MB_DB_*` like [MB_DB_HOST](#mb_db_host). Also used when certain Connection String parameters are required for the connection. The connection type requirement is the same as [MB_DB_TYPE](#mb_db_type).

Examples:

```
jdbc:postgresql://db.example.com:5432/mydb?user=dbuser&password=dbpassword

jdbc:postgresql://db.example.com:5432/mydb?user=dbuser&password=dbpassword&ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory

jdbc:mysql://db.example.com:3306/mydb?user=dbuser&password=dbpassword
```

### `MB_DB_DBNAME`

Type: string<br>
Default: `null`

The database name of the application database used with [MB_DB_HOST](#mb_db_host).

### `MB_DB_FILE`

Type: string<br>
Default: `"metabase.db"`

Location of H2 database file. Should not include the `.mv.db` (or `.h2.db`) file extension. Used when [MB_DB_TYPE](#mb_db_type) is set to`"h2"`.

Can also be used when migrating away from H2 to specify where the existing data should be read from.

### `MB_DB_HOST`

Type: string<br>
Default: `null`

The host name or IP address of the application database. Used when [MB_DB_TYPE](#mb_db_type) is different than `"h2"`.

### `MB_DB_IN_MEMORY`

Type: boolean<br>
Default: `null`

Used for testing with [MB_DB_FILE](#mb_db_file).

### `MB_DB_PASS`

Type: string<br>
Default: `null`

The password for [MB_DB_HOST](#mb_db_host).

### `MB_DB_PORT`

Type: integer<br>
Default: `null`

The port for [MB_DB_HOST](#mb_db_host).

### `MB_DB_TYPE`

Type: string (`"h2"`, `"postgres"`, `"mysql"`)<br>
Default: `"h2"`

When `"h2"`, the application database is loaded from [MB_DB_FILE](#mb_db_file), otherwise [MB_DB_HOST](#mb_db_host) will be used to define application database.

### `MB_DB_USER`

Type: string<br>
Default: `null`

The username for [MB_DB_HOST](#mb_db_host).

### `MB_DEV_ADDITIONAL_DRIVER_MANIFEST_PATHS`

Type: string<br>
Default: `null`

Used during development of third-party drivers. Set the value to have that plugin manifest get loaded during startup. Specify multiple plugin manifests by comma-separating them.

### `MB_DISABLE_SESSION_THROTTLE`

Type: boolean<br>
Default: `false`

When `true`, this will disable session throttling. **Warning:** It is not recommended to disable throttling, since it is a protective measure against brute-force attacks.

Use [MB_SOURCE_ADDRESS_HEADER](#mb_source_address_header) to set the IP address of the remote client from e.g. a reverse-proxy.

### `MB_EMOJI_IN_LOGS`

Type: boolean<br>
Default: `true`

Emojis on log lines. When set to `false` it will disable log line emojis. This is disabled on Windows. Related to [MB_COLORIZE_LOGS](#mb_colorize_logs).

### `MB_ENABLE_TEST_ENDPOINTS`

Type: boolean<br>
Default: `null`

When `true`, this will enable `/api/testing` endpoint. **Warning:** This should never be enabled in production system.

### `MB_ENABLE_XRAYS`

Type: boolean<br>
Default: `true`

Allow users to explore data using X-rays.

### `MB_ENCRYPTION_SECRET_KEY`

Type: string<br>
Default: `null`

When set, this will encrypt database credentials stored in the application database. Requirement: minimum 16 characters base64-encoded string.

Also see documentation page [Encrypting database details at rest](../databases/encrypting-details-at-rest.md).

### `MB_JDBC_DATA_WAREHOUSE_UNRETURNED_CONNECTION_TIMEOUT_SECONDS`

Type: integer<br>
Default: `1200`<br>
Since: v47.4

Metabase's query processor will normally kill connections when their queries time out, but in practice some connections can be severed and go undetected by Metabase, staying alive even after a query returns or times out. This environment variable tells Metabase how long to wait before killing connections if no response is received from the connection.

This variable affects connections that are severed and undetected by Metabase (that is, in situations where Metabase never receives a connection closed signal and is treating an inactive connection as active). You may want to adjust this variable's value if your connection is unreliable or is a dynamic connections behind a SSH tunnel where the connection to the SSH tunnel host may stay active even after the connection from the SSH tunnel host to your database is severed.

Unless set otherwise, the default production value for `metabase.query-processor.query-timeout-ms` is used which is 1,200,000 ms (i.e. 1,200 seconds or 20 minutes).

### `MB_JETTY_ASYNC_RESPONSE_TIMEOUT`

Type: integer<br>
Default: `600000`<br>
Since: v35.0

Timeout of Jetty async threads, defined in milliseconds. The default is 10 minutes. Very few things might reach that timeout, since they return some type of data before, but things like CSV downloads might.

### `MB_JETTY_DAEMON`

Type: boolean<br>
Default: `false`

Use daemon threads.

### `MB_JETTY_HOST`

Type: string<br>
Default: `localhost` for JAR, `0.0.0.0` for Docker

Configure a host either as a host name or IP address to identify a specific network interface on which to listen. If set to `"0.0.0.0"`, Metabase listens on all network interfaces. It will listen on the port specified in [MB_JETTY_PORT](#mb_jetty_port).

### `MB_JETTY_JOIN`

Type: boolean<br>
Default: `true`

Blocks the thread until server ends.

### `MB_JETTY_MAXIDLETIME`

Type: integer<br>
Default: `200000`

Maximum idle time for a connection, in milliseconds.

### `MB_JETTY_MAXTHREADS`

Type: integer<br>
Default: `50`

Maximum number of threads.

Change this to a higher value if you notice that regular usage consumes all or close to all threads. When all threads are in use Metabase might feel slow or unresponsive when clicking around the interface.

To see how many threads are being used, check the Metabase logs and look for lines that contain the following: `… Jetty threads: 45/50 …`, which in this case would indicate 45 out of 50 available threads are being used.

Related [MB_ASYNC_QUERY_THREAD_POOL_SIZE](#mb_async_query_thread_pool_size).

### `MB_JETTY_MINTHREADS`

Type: integer<br>
Default: `8`

Minimum number of threads.

### `MB_JETTY_PORT`

Type: integer<br>
Default: `3000`

Configure which port to use for HTTP. It will listen on the interface specified in [MB_JETTY_HOST](#mb_jetty_host).

### `MB_JETTY_REQUEST_HEADER_SIZE`

Type: integer<br>
Default: `8192`<br>
Since: v36.0

Maximum size of a request header, in bytes. Increase this value if you are experiencing errors like "Request Header Fields Too Large".

### `MB_JETTY_SSL`

Type: boolean<br>
Default: `null`

When set to `true`, will enable HTTPS with the options configured in the `MB_JETTY_SSL_*` variables.

Also see the [Customizing Jetty web server](customizing-jetty-webserver.md) documentation page.

### `MB_JETTY_SSL_CLIENT_AUTH`

Type: boolean<br>
Default: `null`

Configure Java SSL client authentication. When set to `true`, client certificates are required and verified by the certificate authority in the TrustStore.

### `MB_JETTY_SSL_KEYSTORE`

Type: string<br>
Default: `null`

Path to Java KeyStore file.

### `MB_JETTY_SSL_KEYSTORE_PASSWORD`

Type: string<br>
Default: `null`

Password for Java KeyStore file.

### `MB_JETTY_SSL_PORT`

Type: integer<br>
Default: `null`

Configure which port to use for HTTPS. It will listen on the interface specified in [MB_JETTY_HOST](#mb_jetty_host).

### `MB_JETTY_SSL_TRUSTSTORE`

Type: string<br>
Default: `null`

Path to Java TrustStore file.

### `MB_JETTY_SSL_TRUSTSTORE_PASSWORD`

Type: string<br>
Default: `null`

Password for Java TrustStore file.

### `MB_LANDING_PAGE`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `""`

Default page to show people when they log in.

### `MB_LOAD_ANALYTICS_CONTENT`

Type: Boolean<br>
Default: True

If you want to exclude the [Metabase analytics](../usage-and-performance-tools/usage-analytics.md) collection, you can set `MB_LOAD_ANALYTICS_CONTENT=false`. Setting this environment variable to false can also come in handy when migrating environments, as it can simplify the migration process.

### `MB_NO_SURVEYS`

Type: boolean<br>
Default: `false`<br>

Metabase will send a sentiment survey to people who create a number of questions and dashboards to gauge how well the product is doing with respect to making things easy for creators.

Metabase will only send these emails to people who have in the past 2 months:

- Created at least 10 questions total
- Created at least 2 SQL questions
- Created at least 1 dashboard

If you're whitelabeling Metabase, these survey emails will only be sent to admins for that instance who meet that criteria.

If you don't want Metabase to send these emails, set `MB_NO_SURVEYS=true`.

### `MB_NS_TRACE`

Type: string<br>
Default: `""`

Comma-separated namespaces to trace. **WARNING:** Could log sensitive information like database passwords.

### `MB_PASSWORD_COMPLEXITY`

Type: string (`"weak"`, `"normal"`, `"strong"`)<br>
Default: `"normal"`

Enforce a password complexity rule to increase security for regular logins. This only applies to new users or users that are changing their password. Related [MB_PASSWORD_LENGTH](#mb_password_length)

- `weak` no character constraints
- `normal` at least 1 digit
- `strong` minimum 8 characters w/ 2 lowercase, 2 uppercase, 1 digit, and 1 special character

### `MB_PASSWORD_LENGTH`

Type: integer<br>
Default: `6`

Set a minimum password length to increase security for regular logins. This only applies to new users or users that are changing their password. Uses the length of [MB_PASSWORD_COMPLEXITY](#mb_password_complexity) if not set.

### `MB_PLUGINS_DIR`

Type: string<br>
Default: `"plugins"`

Path of the "plugins" directory, which is used to store the Metabase database drivers. The user who is running Metabase should have permission to write to the directory. When running the JAR, the default directory is `plugins`, created in the same location as the JAR file. When running Docker, the default directory is `/plugins`.

The location is where custom third-party drivers should be added. Then Metabase will load the driver on startup, which can be verified in the log.

### `MB_PREMIUM_EMBEDDING_TOKEN`

Type: string<br>
Default: `null`

The license token used for Pro and Enterprise to enable premium features on the Enterprise edition. It is also used for the deprecated "Premium Embedding" functionality on the OSS edition.

### `MB_QP_CACHE_BACKEND`

Type: string<br>
Default: `"db"`

Current cache backend. Dynamically rebindable primarily for test purposes.

### `MB_SEARCH_TYPEAHEAD_ENABLED`

Type: boolean<br>
Default: `true`<br>
Since: v39.0

Show auto-suggestions when using the global search in the top navigation bar.

### `MB_SEND_EMAIL_ON_FIRST_LOGIN_FROM_NEW_DEVICE`

Type: boolean<br>
Default: `true`<br>
Since: v39.0

Send email notification to user, when they login from a new device. Set to `false` to stop sending "We've noticed a new login on your Metabase account" emails for all users.

Also, this variable controls the geocoding service that Metabase uses to know the location from where your users logged in. Setting this variable to false also disables this reverse geocoding functionality.

### `MB_SEND_NEW_SSO_USER_ADMIN_EMAIL`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `true`

Send email notifications to users in Admin group, when a new SSO users is created on Metabase.

### `MB_SETUP_TOKEN`

Type: string<br>
Default: `null`

An UUID token used to signify that an instance has permissions to create the initial User. This is created upon the first launch of Metabase, by the first instance; once used, it is cleared out, never to be used again.

### `MB_SHOW_LIGHTHOUSE_ILLUSTRATION`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `true`<br>
Since: v44.0

Display the lighthouse illustration on the home and login pages.

### `MB_JETTY_SKIP_SNI`

Type: string<br>
Default: `"true"`<br>
Since: v48.4

Setting `MB_JETTY_SKIP_SNI=true` (the default setting) turns off the Server Name Indication (SNI) checks in the Jetty web server. Normally you would leave this enabled. If, however, you're terminating the Transport Layer Security (TLS) connection on Metabase itself, and you're getting an error like `HTTP ERROR 400 Invalid SNI`, consider either setting `MB_JETTY_SKIP_SNI=false`, or use another SSL certificate that exactly matches the domain name of the server.

### `MB_SOURCE_ADDRESS_HEADER`

Type: string<br>
Default: `X-Forwarded-For`

Identify the source of HTTP requests by this header's value, instead of its remote address. Related to [MB_DISABLE_SESSION_THROTTLE](#mb_disable_session_throttle).

### `MB_SSL_CERTIFICATE_PUBLIC_KEY`

Type: string<br>
Default: `null`

Base-64 encoded public key for this sites SSL certificate. Specify this to enable HTTP Public Key Pinning. Using HPKP is no longer recommended. See http://mzl.la/1EnfqBf for more information.
