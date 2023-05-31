---
title: Environment variables
redirect_from:
  - /docs/latest/operations-guide/environment-variables
---

# Environment variables

Many settings in Metabase can be viewed and modified in the Admin Panel, or set via environment variables. The environment variables always take precedence. Note that the environment variables won't get written into the application database.

Setting environment variables can be done in various ways depending on how Metabase is being run.

JAR file:

```
# Mac, Linux and other Unix-based systems
export MB_SITE_NAME="Awesome Company"
# Windows Powershell
$env:MB_SITE_NAME="Awesome Company"
# Windows batch/cmd
set MB_SITE_NAME="Awesome Company"

java -jar metabase.jar
```

Or set it as Java property, which works the same across all systems:

```
java -DMB_SITE_NAME="Awesome Company" -jar metabase.jar
```

Docker:

```
docker run -d -p 3000:3000 -e MB_SITE_NAME="Awesome Company" --name metabase metabase/metabase
```

---

### `MAX_SESSION_AGE`

Type: integer<br>
Default: `20160`

Session expiration, defined in minutes (default is 2 weeks), which will log out users after the defined period and require re-authentication.

Note: This setting is not an idle/inactivity timeout. If you set this to 15 minutes, your users have to login (or re-authenticate) again every 15 minutes. Use [MB_SESSION_TIMEOUT](#mb_session_timeout) to control timeout based on inactivity.

Use [MB_SESSION_COOKIES](#mb_session_cookies) to also expire sessions, when browser is closed.

Also see the [Changing session expiration](../people-and-groups/changing-session-expiration.md) documentation page.

### `MB_ADMIN_EMAIL`

Type: string<br>
Default: `null`

The email address users should be referred to if they encounter a problem.

### `MB_ANON_TRACKING_ENABLED`

Type: boolean<br>
Default: `true`

Enable the collection of anonymous usage data in order to help Metabase improve.

### `MB_API_KEY`

Type: string<br>
Default: `null`

Middleware that enforces validation of the client via the request header `X-Metabase-Apikey`. If the header is available, then it’s validated against `MB_API_KEY`. When it matches, the request continues; otherwise it’s blocked with a 403 Forbidden response.

### `MB_APPLICATION_COLORS`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"{}"`

JSON object of primary colors used in charts and throughout Metabase. Examples:

To change the user interface colors:

```
{
   "brand":"#ff003b",
   "filter":"#FF003B",
   "summarize":"#FF003B"
}
```

To change the chart colors:

```
{
   "accent0":"#FF0005",
   "accent1":"#E6C367",
   "accent2":"#B9E68A",
   "accent3":"#8AE69F",
   "accent4":"#8AE6E4",
   "accent5":"#8AA2E6",
   "accent6":"#B68AE6",
   "accent7":"#E68AD0"
}
```

### `MB_APPLICATION_DB_MAX_CONNECTION_POOL_SIZE`

Type: integer<br>
Default: `15`<br>
Since: v35.0

Maximum number of connections to the Metabase application database.

Change this to a higher value if you notice that regular usage consumes all or close to all connections. When all connections are in use, Metabase might feel slow or unresponsive when clicking around the interface.

To see how many connections are being used, check the Metabase logs and look for lines that contains the following: `… App DB connections: 12/15 …`. In this example, 12 out of 15 available connections are being used.

See [MB_JDBC_DATA_WAREHOUSE_MAX_CONNECTION_POOL_SIZE](#mb_jdbc_data_warehouse_max_connection_pool_size) for setting maximum connections to the databases connected to Metabase.

### `MB_APPLICATION_FAVICON_URL`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"frontend_client/favicon.ico"`

Path or URL to favicon file.

### `MB_APPLICATION_FONT`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"Lato"`<br>
Since: v44.0

Change the font used in Metabase. See [fonts](../configuring-metabase/fonts.md).

### `MB_APPLICATION_FONT_FILES`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"{}"`<br>
Since: v44.0

Tell Metabase which font files to use for different styles. Example value:

```
[
  {
     "src": "https://example.com/resources/font-400",
     "fontFormat": "ttf",
     "fontWeight": 400,
  },
  {
     "src": "https://example.com/resources/font-700",
     "fontFormat": "woff",
     "fontWeight": 700,
  }
]
```

See [fonts](../configuring-metabase/fonts.md).

### `MB_APPLICATION_LOGO_URL`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"app/assets/img/logo.svg"`

Path or URL to logo file. For best results use SVG format.

### `MB_APPLICATION_NAME`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"Metabase"`

Replace the word `Metabase` wherever it appears with the defined string.

### `MB_ASYNC_QUERY_THREAD_POOL_SIZE`

Type: integer<br>
Default: `50`<br>
Since: v35.0

Maximum number of async Jetty threads. If not set, then [MB_JETTY_MAXTHREADS](#mb_jetty_maxthreads) will be used, otherwise it will use the default.

### `MB_AUDIT_MAX_RETENTION_DAYS`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: integer<br>
Default: 0 (Metabase keeps all rows)<br>

Sets the maximum number of days Metabase preserves rows in the `query_execution` table in the application database. 

Twice a day, Metabase will delete rows older than this threshold. 

The minimum value is `30` days (Metabase will treat entered values of `1` to `29` the same as `30`). If set to `0`, Metabase will keep all rows.

### `MB_BREAKOUT_BIN_WIDTH`

Type: double<br>
Default: `10.0`

When using the default binning strategy for a field of type Coordinate (such as Latitude and Longitude), this number will be used as the default bin width (in degrees).

### `MB_BREAKOUT_BINS_NUM`

Type: integer<br>
Default: `8`

When using the default binning strategy and a number of bins is not provided, this number will be used as the default.

### `MB_CHECK_FOR_UPDATES`

Type: boolean<br>
Default: `true`

Identify when new versions of Metabase are available.

### `MB_COLORIZE_LOGS`

Type: boolean<br>
Default: `true`

Color log lines. When set to `false` it will disable log line colors. This is disabled on Windows. Related to [MB_EMOJI_IN_LOGS](#mb_emoji_in_logs).

### `MB_CONFIG_FILE_PATH`

Type: string<br>
Default: `config.yml`

This feature requires the `advanced-config` feature flag on your token.

### `MB_CUSTOM_FORMATTING`

Type: string<br>
Default: `"{}"`

JSON object keyed by type, containing formatting settings.

### `MB_CUSTOM_GEOJSON`

Type: string<br>
Default: `"{}"`

JSON object containing information about custom GeoJSON files for use in map visualizations instead of the default US State or World GeoJSON.

### `MB_CUSTOM_GEOJSON_ENABLED`

Type: boolean<br>
Default: `true`

Whether or not the use of custom GeoJSON is enabled.

### `MB_DB_AUTOMIGRATE`

Type: boolean<br>
Default: `true`

When set to `false`, Metabase will print migrations needed to be done in the application database and exit. Those migrations need to be applied manually. When `true`, Metabase will automatically make changes to the application database. This is not related to migrating away from H2.

### `MB_DB_CONNECTION_TIMEOUT_MS`

Type: integer<br>
Default: `10000`

Timeout in milliseconds for connecting to databases, both Metabase application database and data connections. In case you're connecting via an SSH tunnel and run into a timeout, you might consider increasing this value as the connections via tunnels have more overhead than connections without.

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

### `MB_EMAIL_FROM_ADDRESS`

Type: string<br>
Default: `null`

Address you want to use as the sender of emails generated by Metabase, such as pulses or account invitations.

### `MB_EMAIL_FROM_NAME`

Type: string<br>
Default: `null`<br>
Since: v44.0

Use the defined name in emails. By default, no name is used, meaning it just displays the [MB_EMAIL_FROM_ADDRESS](#mb_email_from_address) email address.

### `MB_EMAIL_REPLY_TO`

Type: string<br>
Default: `null`<br>
Since: v44.0

Include a Reply-To address in emails. Has to be in the format `"['address@domain.example']"` (including the square brackets).

### `MB_EMAIL_SMTP_HOST`

Type: string<br>
Default: `null`

The address of the SMTP server that handles your emails.

### `MB_EMAIL_SMTP_PASSWORD`

Type: string<br>
Default: `null`

SMTP password.

### `MB_EMAIL_SMTP_PORT`

Type: integer<br>
Default: `null`

The port your SMTP server uses for outgoing emails.

### `MB_EMAIL_SMTP_SECURITY`

Type: string (`"tls"`, `"ssl"`, `"starttls"`, `"none"`)<br>
Default: `"none"`

SMTP secure connection protocol.

### `MB_EMAIL_SMTP_USERNAME`

Type: string<br>
Default: `null`

SMTP username.

### `MB_EMBEDDING_APP_ORIGIN`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`

URL of origin allowed to embed the full Metabase application.

Related to [MB_SESSION_COOKIE_SAMESITE](#mb_session_cookie_samesite). Read more about [FullApp Embedding](../embedding/full-app-embedding.md).

### `MB_EMBEDDING_SECRET_KEY`

Type: string<br>
Default: `null`<br>
Since: v44.0

Secret key used to sign JSON Web Tokens for requests to /api/embed endpoints.

The secret should be kept safe (treated like a password) and recommended to be a 64 character string.

This is for Signed Embedding, and has nothing to do with JWT SSO authentication, which is [MB_JWT_*](#mb_jwt_enabled).

### `MB_EMOJI_IN_LOGS`

Type: boolean<br>
Default: `true`

Emojis on log lines. When set to `false` it will disable log line emojis. This is disabled on Windows. Related to [MB_COLORIZE_LOGS](#mb_colorize_logs).

### `MB_ENABLE_EMBEDDING`

Type: boolean<br>
Default: `false`

Allow admins to securely embed questions and dashboards within other applications.

### `MB_ENABLE_NESTED_QUERIES`

Type: boolean<br>
Default: `true`

Allow using a saved question as the source for other queries.

### `MB_ENABLE_PASSWORD_LOGIN`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `true`

Still allow logging in by email and password when SSO login options are enabled.

### `MB_ENABLE_PUBLIC_SHARING`

Type: boolean<br>
Default: `false`

Enable admins to create publicly viewable links (and embedded iframes) for questions and dashboards.

### `MB_ENABLE_QUERY_CACHING`

Type: boolean<br>
Default: `false`

Enabling caching will save the results of queries that take a long time to run.

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

### `MB_GOOGLE_AUTH_AUTO_CREATE_ACCOUNTS_DOMAIN`

Type: string<br>
Default: `null`

When set, allows users to automatically create their Metabase account by logging in if their Google account email address is from this domain.

Since v40.0, the Pro and Enterprise plans supports inputting multiple domains separated by commas.

### `MB_GOOGLE_AUTH_CLIENT_ID`

Type: string<br>
Default: `null`

Client ID for Google Auth SSO. If this is set, Google Auth is considered to be enabled.

### `MB_JDBC_DATA_WAREHOUSE_MAX_CONNECTION_POOL_SIZE`

Type: integer<br>
Default: `15`<br>
Since: v35.0

Maximum number of connections to the data source databases. The maximum is for each database setup in Admin Panel > Databases, not a total for all databases.

Change this to a higher value if you notice that regular usage consumes all or close to all connections. When all connections are in use then Metabase will be slower to return results for queries, since it would have to wait for an available connection before processing the next query in the queue.

See [MB_APPLICATION_DB_MAX_CONNECTION_POOL_SIZE](#mb_application_db_max_connection_pool_size) for setting maximum connections to the Metabase application database.

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

### `MB_JETTY_MAXQUEUED`

Type: integer<br>
Default: _"FIX ME"_

Maximum number of requests to be queued when all threads are busy.

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

### `MB_JWT_ATTRIBUTE_EMAIL`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"email"`

Key to retrieve the JWT user's email address.

### `MB_JWT_ATTRIBUTE_FIRSTNAME`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"first_name"`

Key to retrieve the JWT user's first name.

### `MB_JWT_ATTRIBUTE_GROUPS`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"groups"`

Key to retrieve the JWT user's groups.

### `MB_JWT_ATTRIBUTE_LASTNAME`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"last_name"`

Key to retrieve the JWT user's last name.

### `MB_JWT_ENABLED`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `false`

When set to `true`, will enable JWT authentication with the options configured in the `MB_JWT_*` variables.

This is for JWT SSO authentication, and has nothing to do with Signed Embedding, which is [MB_EMBEDDING_SECRET_KEY](#mb_embedding_secret_key)

### `MB_JWT_GROUP_MAPPINGS`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"{}"`

JSON object containing JWT to Metabase group mappings. Should be in the form: `'{"groupName": [1, 2, 3]}'` where keys are JWT groups and values are lists of Metabase groups IDs.

### `MB_JWT_GROUP_SYNC`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `false`

Enable group membership synchronization with JWT.

### `MB_JWT_IDENTITY_PROVIDER_URI`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`

URL of JWT based login page.

### `MB_JWT_SHARED_SECRET`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`

String used to seed the private key used to validate JWT messages.

### `MB_LANDING_PAGE`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `""`

Default page to show people when they log in.

### `MB_LDAP_ATTRIBUTE_EMAIL`

Type: string<br>
Default: `"mail"`

Attribute to use for the user's email. Usually 'mail', 'email' or 'userPrincipalName'.

### `MB_LDAP_ATTRIBUTE_FIRSTNAME`

Type: string<br>
Default: `"givenName"`

Attribute to use for the user's first name. Usually 'givenName'.

### `MB_LDAP_ATTRIBUTE_LASTNAME`

Type: string<br>
Default: `"sn"`

Attribute to use for the user's last name. Usually 'sn'.

### `MB_LDAP_BIND_DN`

Type: string<br>
Default: `null`

The Distinguished Name to bind as (if any). This user will be used to lookup information about other users.

### `MB_LDAP_ENABLED`

Type: boolean<br>
Default: `false`

When set to `true`, will enable LDAP authentication with the options configured in the `MB_LDAP_*` variables.

### `MB_LDAP_GROUP_BASE`

Type: string<br>
Default: `null`

Search base for groups. Not required if your LDAP directory provides a 'memberOf' overlay. (Will be searched recursively.)

### `MB_LDAP_GROUP_MAPPINGS`

Type: string<br>
Default: `"{}"`

JSON object containing LDAP to Metabase group mappings.

### `MB_LDAP_GROUP_MEMBERSHIP_FILTER`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"(member={dn})"`<br>
Since: v40.0

Group membership lookup filter. The placeholders `{dn}` and `{uid}` will be replaced by the user's Distinguished Name and UID, respectively.

### `MB_LDAP_GROUP_SYNC`

Type: boolean<br>
Default: `false`

Enable group membership synchronization with LDAP.

### `MB_LDAP_HOST`

Type: string<br>
Default: `null`

Server hostname.

### `MB_LDAP_PASSWORD`

Type: string<br>
Default: `null`

The password to bind with for the lookup user.

### `MB_LDAP_PORT`

Type: string<br>
Default: `"389"`

Server port, usually 389 or 636 if SSL is used.

### `MB_LDAP_SECURITY`

Type: string (`"none"`, `"ssl"`, `"starttls"`)<br>
Default: `"none"`

Use SSL, TLS or plain text.

### `MB_LDAP_SYNC_USER_ATTRIBUTES`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `true`

Sync user attributes when someone logs in via LDAP.

### `MB_LDAP_SYNC_USER_ATTRIBUTES_BLACKLIST`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"userPassword,dn,distinguishedName"`

Comma-separated list of user attributes to skip syncing for LDAP users.

### `MB_LDAP_USER_BASE`

Type: string<br>
Default: `null`

Search base for users. (Will be searched recursively.)

### `MB_LDAP_USER_FILTER`

Type: string<br>
Default: `"(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))"`

User lookup filter. The placeholder `{login}` will be replaced by the user supplied login.

### `MB_LOADING_MESSAGE`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string (`"doing-science"`, `"running-query"`, `"loading-results"`)<br>
Default: `"doing-science."`<br>
Since: v44.0

Change the loading message, when waiting for results.

### `MB_MAP_TILE_SERVER_URL`

Type: string<br>
Default: `"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"`

The map tile server URL template used in map visualizations, for example from OpenStreetMaps or MapBox.

### `MB_NATIVE_QUERY_AUTOCOMPLETE_MATCH_STYLE`

Type: string (`"substring"`, `"prefix"`, `"off"`)<br>
Default: `"substring"`<br>
Since: v44.1

Matching style for native query editor's autocomplete. Larger instances can have performance issues matching using `substring`, so can use `prefix` matching, or turn autocompletions `off`.

### `MB_NOTIFICATION_LINK_BASE_URL`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`<br>
Since: v42.0

The base URL where dashboard notitification links will point to instead of the Metabase base URL. Only applicable for users who utilize FullApp embedding and subscriptions.

### `MB_NOTIFICATION_RETRY_INITIAL_INTERVAL`

Type: integer<br>
Default: `500`<br>
Since: v44.0

The initial retry delay in milliseconds when delivering notifications.

### `MB_NOTIFICATION_RETRY_MAX_ATTEMPTS`

Type: integer<br>
Default: `7`<br>
Since: v44.0

The maximum number of attempts for delivering a single notification.

### `MB_NOTIFICATION_RETRY_MAX_INTERVAL_MILLIS`

Type: integer<br>
Default: `30000`<br>
Since: v44.0

The maximum delay between attempts to deliver a single notification.

### `MB_NOTIFICATION_RETRY_MULTIPLIER`

Type: double<br>
Default: `2.0`<br>
Since: v44.0

The delay multiplier between attempts to deliver a single notification.

### `MB_NOTIFICATION_RETRY_RANDOMIZATION_FACTOR`

Type: double<br>
Default: `0.1`<br>
Since: v44.0

The randomization factor of the retry delay when delivering notifications.

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

### `MB_PERSISTED_MODEL_REFRESH_CRON_SCHEDULE`

Type: string<br>
Default: `"0 0 0/6 * * ? *"`<br>
Since: v44.0

Cron syntax string to schedule refreshing persisted models.

### `MB_PERSISTED_MODELS_ENABLED`

Type: boolean<br>
Default: `false`<br>
Since: v44.0

Allow persisting models into the source database.

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

### `MB_QUERY_CACHING_MAX_KB`

Type: integer<br>
Default: `1000`

The maximum size of the cache, per saved question, in kilobytes.

### `MB_QUERY_CACHING_MAX_TTL`

Type: integer<br>
Default: `8640000`

The absolute maximum time to keep any cached query results, in seconds. The default value is 100 days in seconds.

### `MB_QUERY_CACHING_MIN_TTL`

Type: integer<br>
Default: `60`

Metabase will cache all saved questions with an average query execution time longer than this many seconds.

### `MB_QUERY_CACHING_TTL_RATIO`

Type: integer<br>
Default: `10`

To determine how long each saved question's cached result should stick around, we take the query's average execution time and multiply that by whatever you input here. So if a query takes on average 2 minutes to run, and you input 10 for your multiplier, its cache entry will persist for 20 minutes.

### `MB_REDIRECT_ALL_REQUESTS_TO_HTTPS`

Type: boolean<br>
Default: `false`<br>
Since: v36.0

Force all traffic to use HTTPS via a redirect, if the site URL is HTTPS. Related [MB_SITE_URL](#mb_site_url)

### `MB_REPORT_TIMEZONE`

Type: string<br>
Default: `null`

Connection timezone to use when executing queries. Defaults to system timezone.

### `MB_SAML_APPLICATION_NAME`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"Metabase"`

This application name will be used for requests to the Identity Provider.

### `MB_SAML_ATTRIBUTE_EMAIL`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"`

SAML attribute for the user's email address.

### `MB_SAML_ATTRIBUTE_FIRSTNAME`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"`

SAML attribute for the user's first name.

### `MB_SAML_ATTRIBUTE_GROUP`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"member_of"`

SAML attribute for group syncing.

### `MB_SAML_ATTRIBUTE_LASTNAME`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"`

SAML attribute for the user's last name.

### `MB_SAML_ENABLED`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `false`

When set to `true`, will enable SAML authentication with the options configured in the `MB_SAML_*` variables.

### `MB_SAML_GROUP_MAPPINGS`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"{}"`

JSON object containing SAML to Metabase group mappings. Should be in the form: `'{"groupName": [1, 2, 3]}'` where keys are SAML groups and values are lists of Metabase groups IDs.

### `MB_SAML_GROUP_SYNC`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `false`

Enable group membership synchronization with SAML.

### `MB_SAML_IDENTITY_PROVIDER_CERTIFICATE`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`

Encoded certificate for the identity provider, provided as the content, not a file path.

### `MB_SAML_IDENTITY_PROVIDER_ISSUER`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`

This is a unique identifier for the IdP. Often referred to as Entity ID or simply Issuer. Depending on your IdP, this usually looks something like `http://www.example.com/141xkex604w0Q5PN724v`

### `MB_SAML_IDENTITY_PROVIDER_URI`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`

This is the URL where your users go to log in to your identity provider. Depending on which IdP you're using, this usually looks like `https://your-org-name.okta.com`.

### `MB_SAML_KEYSTORE_ALIAS`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"metabase"`

Alias for the key that Metabase should use for signing SAML requests.

### `MB_SAML_KEYSTORE_PASSWORD`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `"changeit"`

Password for opening the KeyStore.

### `MB_SAML_KEYSTORE_PATH`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`

Absolute path to the KeyStore file to use for signing SAML requests.

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

### `MB_SESSION_COOKIE_SAMESITE`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string (`"none"`, `"lax"`, `"strict"`)<br>
Default: `"lax"`

When using FullApp embedding, and the embedding website is hosted under a domain other than the one your Metabase instance is hosted under, you most likely need to set it to `"none"`.

Setting the variable to `"none"` requires you to use HTTPS, otherwise browsers will reject the request.

Related to [MB_EMBEDDING_APP_ORIGIN](#mb_embedding_app_origin). Read more about [FullApp Embedding](../embedding/full-app-embedding.md).

Learn more about SameSite cookies: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite

### `MB_SESSION_COOKIES`

Type: boolean<br>
Default: `null`

When set to `true`, the user login session will expire when the browser is closed. The user login session will always expire after the amount of time defined in [MAX_SESSION_AGE](#max_session_age) (by default 2 weeks).

This overrides the "Remember me" checkbox when logging in.

Also see the [Changing session expiration](../people-and-groups/changing-session-expiration.md) documentation page.

### `MB_SESSION_TIMEOUT`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`<br>
Since: v44.0

Time before inactive users are logged out. By default, sessions last according to [MAX_SESSION_AGE](#max_session_age) and [MB_SESSION_COOKIES](#mb_session_cookies).

Has to be in the format `"{:amount 60 :unit 'minutes'}"` where the unit is one of "seconds", "minutes" or "hours".

### `MB_SETUP_TOKEN`

Type: string<br>
Default: `null`

An UUID token used to signify that an instance has permissions to create the initial User. This is created upon the first launch of Metabase, by the first instance; once used, it is cleared out, never to be used again.

### `MB_SHOW_DATABASE_SYNCING_MODAL`

Type: boolean<br>
Default: `null`

Whether an introductory modal should be shown after the next database connection is added. Defaults to false if any non-default database has already finished syncing for this instance.

### `MB_SHOW_HOMEPAGE_DATA`

Type: boolean<br>
Default: `null`

Hide the "Our data" section from the homepage by setting it to `false`. Show the section with `true`, in case it was manually removed.

### `MB_SHOW_HOMEPAGE_XRAYS`

Type: boolean<br>
Default: `null`

Hide the X-rays section from the homepage by setting it to `false`. Show the section with `true`, in case it was manually removed. Even if set to `true`, these will be hidden if any dashboards have been pinned in the "Our Analytics" collection.

### `MB_SHOW_LIGHTHOUSE_ILLUSTRATION`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `true`<br>
Since: v44.0

Display the lighthouse illustration on the home and login pages.

### `MB_SHOW_METABOT`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: boolean<br>
Default: `true`<br>
Since: v44.0

Display the MetaBot character on the home page.

### `MB_SITE_LOCALE`

Type: string<br>
Default: `"en"`

The default language for this Metabase instance. This setting applies to the Metabase UI, system emails, [dashboard subscriptions](../dashboards/subscriptions.md), and [alerts](../questions/sharing/alerts.md). People can override the default language from their [account settings](../people-and-groups/account-settings.md).

### `MB_SITE_NAME`

Type: string<br>
Default: `"Metabase"`

The name used for this instance of Metabase.

### `MB_SITE_URL`

Type: string<br>
Default: `null`

The base URL where users access Metabase, e.g. `https://metabase.example.com` or `https://example.com/metabase`.

This URL is critical for things like SSO authentication, email links, embedding and more. Even difference with `http://` vs `https://` can cause problems. Make sure that the address defined is how Metabase is being accessed.

### `MB_SLACK_APP_TOKEN`

Type: string<br>
Default: `null`<br>
Since: v42.0

Slack API bearer token obtained from https://api.slack.com/web#authentication

In previous versions before v42.0, the variable `MB_SLACK_TOKEN` was used, but that is deprecated and should not be used anymore.

### `MB_SLACK_FILES_CHANNEL`

Type: string<br>
Default: `"metabase_files"`<br>
Since: v42.0

Set the system files channel used by Metabase to store images. This channel has to be public, and is not intended to be used by humans. The Slack App has to be invited into this channel.

### `MB_SOURCE_ADDRESS_HEADER`

Type: string<br>
Default: `X-Forwarded-For`

Identify the source of HTTP requests by this header's value, instead of its remote address. Related to [MB_DISABLE_SESSION_THROTTLE](#mb_disable_session_throttle).

### `MB_SQL_JDBC_FETCH_SIZE`

Type: integer<br>
Default: `500`<br>
Since: v41.1

Fetch size for result sets. We want to ensure that the JDBC ResultSet objects are not realizing the entire results in memory. Only applicable to some databases. Setting this too high can cause OutOfMemory, setting it too low can cause performance problems.

### `MB_SSH_HEARTBEAT_INTERVAL_SEC`

Type: integer<br>
Default: `180`

Controls how often the heartbeats are sent when an SSH tunnel is established (in seconds).

### `MB_SSL_CERTIFICATE_PUBLIC_KEY`

Type: string<br>
Default: `null`

Base-64 encoded public key for this sites SSL certificate. Specify this to enable HTTP Public Key Pinning. Using HPKP is no longer recommended. See http://mzl.la/1EnfqBf for more information.

### `MB_START_OF_WEEK`

Type: string<br>
Default: `"sunday"`<br>
Since: v37.0

This will affect things like grouping by week or filtering in GUI queries. It won't affect most SQL queries, although it is used to set the WEEK_START session variable in Snowflake.

### `MB_SUBSCRIPTION_ALLOWED_DOMAINS`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string<br>
Default: `null`<br>
Since: v41.0

Allowed email address domain(s) for new Subscriptions and Alerts. Specify multiple domain comma-separated. When not defined, all domains are allowed.
