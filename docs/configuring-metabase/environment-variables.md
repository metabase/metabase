---
title: Environment variables
redirect_from:
  - /docs/latest/operations-guide/environment-variables
---

# Environment variables

_This documentation was generated from source by running:_

```
clojure -M:ee:run environment-variables-documentation
```

Many settings in Metabase can be viewed and modified in the Admin Panel, or set via environment variables. The environment variables always take precedence. Note that, unlike settings configured in the Admin settings of your Metabase, the environment variables won't get written into the application database.

## How to set environment variables

Setting environment variables can be done in various ways depending on how you're running Metabase.

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

## List of environment variables


### `MB_ADMIN_EMAIL`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `admin-email`

The email address users should be referred to if they encounter a problem.

### `MB_AGGREGATED_QUERY_ROW_LIMIT`

- Type: integer
- Default: `10000`
- [Exported as](../installation-and-operation/serialization.md): `aggregated-query-row-limit`.
- [Configuration file name](./config-file.md): `aggregated-query-row-limit`

Maximum number of rows to return for aggregated queries via the API.

Must be less than 1048575. This environment variable also affects how many rows Metabase includes in dashboard subscription attachments.
  This environment variable also affects how many rows Metabase includes in dashboard subscription attachments.
  See also MB_UNAGGREGATED_QUERY_ROW_LIMIT.

### `MB_ANON_TRACKING_ENABLED`

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `anon-tracking-enabled`

Enable the collection of anonymous usage data in order to help Metabase improve.

### `MB_API_KEY`

- Type: string
- Default: `null`

When set, this API key is required for all API requests.

Middleware that enforces validation of the client via the request header X-Metabase-Apikey.
        If the header is available, then it’s validated against MB_API_KEY.
        When it matches, the request continues; otherwise it’s blocked with a 403 Forbidden response.

### `MB_APPLICATION_COLORS`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: json
- Default: `{}`
- [Exported as](../installation-and-operation/serialization.md): `application-colors`.
- [Configuration file name](./config-file.md): `application-colors`

Choose the colors used in the user interface throughout Metabase and others specifically for the charts. You need to refresh your browser to see your changes take effect.

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

### `MB_APPLICATION_FAVICON_URL`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `app/assets/img/favicon.ico`
- [Exported as](../installation-and-operation/serialization.md): `application-favicon-url`.
- [Configuration file name](./config-file.md): `application-favicon-url`

Upload a file to use as the favicon.

### `MB_APPLICATION_FONT`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `Lato`
- [Exported as](../installation-and-operation/serialization.md): `application-font`.
- [Configuration file name](./config-file.md): `application-font`

Replace “Lato” as the font family.

### `MB_APPLICATION_FONT_FILES`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: json
- Default: `null`
- [Exported as](../installation-and-operation/serialization.md): `application-font-files`.
- [Configuration file name](./config-file.md): `application-font-files`

Tell us where to find the file for each font weight. You don’t need to include all of them, but it’ll look better if you do.

Example value:

```
[
  {
    "src": "https://example.com/resources/font-400",
    "fontFormat": "ttf",
    "fontWeight": 400
  },
  {
    "src": "https://example.com/resources/font-700",
    "fontFormat": "woff",
    "fontWeight": 700
  }
]
```

See [fonts](../configuring-metabase/fonts.md).

### `MB_APPLICATION_LOGO_URL`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `app/assets/img/logo.svg`
- [Exported as](../installation-and-operation/serialization.md): `application-logo-url`.
- [Configuration file name](./config-file.md): `application-logo-url`

Upload a file to replace the Metabase logo on the top bar.

Inline styling and inline scripts are not supported.

### `MB_APPLICATION_NAME`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `Metabase`
- [Exported as](../installation-and-operation/serialization.md): `application-name`.
- [Configuration file name](./config-file.md): `application-name`

Replace the word “Metabase” wherever it appears.

### `MB_ATTACHMENT_TABLE_ROW_LIMIT`

- Type: positive-integer
- Default: `20`

Maximum number of rows to render in an alert or subscription image.

Range: 1-100. To limit the total number of rows included in the file attachment
        for an email dashboard subscription, use MB_UNAGGREGATED_QUERY_ROW_LIMIT.

### `MB_BCC_ENABLED`

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `bcc-enabled`

Whether or not bcc emails are enabled, default behavior is that it is.

### `MB_BREAKOUT_BIN_WIDTH`

- Type: double
- Default: `10.0`
- [Configuration file name](./config-file.md): `breakout-bin-width`

When using the default binning strategy for a field of type Coordinate (such as Latitude and Longitude), this number will be used as the default bin width (in degrees).

### `MB_BREAKOUT_BINS_NUM`

- Type: integer
- Default: `8`
- [Exported as](../installation-and-operation/serialization.md): `breakout-bins-num`.
- [Configuration file name](./config-file.md): `breakout-bins-num`

When using the default binning strategy and a number of bins is not provided, this number will be used as the default.

### `MB_CHECK_FOR_UPDATES`

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `check-for-updates`

Identify when new versions of Metabase are available.

### `MB_CONFIG_FROM_FILE_SYNC_DATABASES`

- Type: boolean
- Default: `true`

Whether to sync newly created Databases during config-from-file initialization. By default, true, but you can disable
  this behavior if you want to sync it manually or use SerDes to populate its data model.

### `MB_CUSTOM_FORMATTING`

- Type: json
- Default: `{}`
- [Exported as](../installation-and-operation/serialization.md): `custom-formatting`.
- [Configuration file name](./config-file.md): `custom-formatting`

Object keyed by type, containing formatting settings.

### `MB_CUSTOM_GEOJSON`

- Type: json
- Default: `null`
- [Exported as](../installation-and-operation/serialization.md): `custom-geojson`.
- [Configuration file name](./config-file.md): `custom-geojson`

JSON containing information about custom GeoJSON files for use in map visualizations instead of the default US State or World GeoJSON.

### `MB_CUSTOM_HOMEPAGE`

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `custom-homepage`

Pick one of your dashboards to serve as homepage. Users without dashboard access will be directed to the default homepage.

### `MB_CUSTOM_HOMEPAGE_DASHBOARD`

- Type: integer
- Default: `null`
- [Configuration file name](./config-file.md): `custom-homepage-dashboard`

ID of dashboard to use as a homepage.

### `MB_DB_CONNECTION_TIMEOUT_MS`

- Type: integer
- Default: `10000`

Consider metabase.driver/can-connect? / can-connect-with-details? to have failed if they were not able to
  successfully connect after this many milliseconds. By default, this is 10 seconds.

Timeout in milliseconds for connecting to databases, both Metabase application database and data connections.
        In case you're connecting via an SSH tunnel and run into a timeout, you might consider increasing this value
        as the connections via tunnels have more overhead than connections without.

### `MB_EE_AI_FEATURES_ENABLED`

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `ee-ai-features-enabled`

Enable AI features.

This feature is experimental.

### `MB_EE_OPENAI_API_KEY`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `ee-openai-api-key`

The OpenAI API Key used in Metabase Enterprise.

This feature is experimental.

### `MB_EE_OPENAI_MODEL`

- Type: string
- Default: `gpt-4-turbo-preview`
- [Configuration file name](./config-file.md): `ee-openai-model`

The OpenAI Model (e.g. gpt-4, gpt-3.5-turbo).

This feature is experimental.

### `MB_EMAIL_FROM_ADDRESS`

- Type: string
- Default: `notifications@metabase.com`
- [Configuration file name](./config-file.md): `email-from-address`

The email address you want to use for the sender of emails.

### `MB_EMAIL_FROM_NAME`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `email-from-name`

The name you want to use for the sender of emails.

### `MB_EMAIL_REPLY_TO`

- Type: json
- Default: `null`
- [Configuration file name](./config-file.md): `email-reply-to`

The email address you want the replies to go to, if different from the from address.

### `MB_EMAIL_SMTP_HOST`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `email-smtp-host`

The address of the SMTP server that handles your emails.

### `MB_EMAIL_SMTP_PASSWORD`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `email-smtp-password`

SMTP password.

### `MB_EMAIL_SMTP_PORT`

- Type: integer
- Default: `null`
- [Configuration file name](./config-file.md): `email-smtp-port`

The port your SMTP server uses for outgoing emails.

### `MB_EMAIL_SMTP_SECURITY`

- Type: keyword
- Default: `:none`
- [Configuration file name](./config-file.md): `email-smtp-security`

SMTP secure connection protocol. (tls, ssl, starttls, or none).

### `MB_EMAIL_SMTP_USERNAME`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `email-smtp-username`

SMTP username.

### `MB_EMBEDDING_APP_ORIGIN`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `embedding-app-origin`

Allow this origin to embed the full Metabase application.

### `MB_EMBEDDING_HOMEPAGE`

- Type: keyword
- Default: `:hidden`
- [Exported as](../installation-and-operation/serialization.md): `embedding-homepage`.
- [Configuration file name](./config-file.md): `embedding-homepage`

Embedding homepage status, indicating if its visible, hidden or has been dismissed.

### `MB_EMBEDDING_SECRET_KEY`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `embedding-secret-key`

Secret key used to sign JSON Web Tokens for requests to `/api/embed` endpoints.

### `MB_ENABLE_EMBEDDING`

- Type: boolean
- Default: `false`
- [Exported as](../installation-and-operation/serialization.md): `enable-embedding`.
- [Configuration file name](./config-file.md): `enable-embedding`

Allow admins to securely embed questions and dashboards within other applications?

### `MB_ENABLE_PASSWORD_LOGIN`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `enable-password-login`

Allow logging in by email and password.

### `MB_ENABLE_PUBLIC_SHARING`

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `enable-public-sharing`

Enable admins to create publicly viewable links (and embeddable iframes) for Questions and Dashboards?

### `MB_ENABLE_QUERY_CACHING`

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `enable-query-caching`

Allow caching results of queries that take a long time to run.

### `MB_ENABLE_XRAYS`

- Type: boolean
- Default: `true`
- [Exported as](../installation-and-operation/serialization.md): `enable-xrays`.
- [Configuration file name](./config-file.md): `enable-xrays`

Allow users to explore data using X-rays.

### `MB_ENUM_CARDINALITY_THRESHOLD`

- Type: integer
- Default: `60`

Enumerated field values with cardinality at or below this point are treated as enums in the pseudo-ddl used in some model prompts.

### `MB_FOLLOW_UP_EMAIL_SENT`

- Type: boolean
- Default: `false`

Have we sent a follow up email to the instance admin?

### `MB_GOOGLE_AUTH_AUTO_CREATE_ACCOUNTS_DOMAIN`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `google-auth-auto-create-accounts-domain`

When set, allow users to sign up on their own if their Google account email address is from this domain.

### `MB_GOOGLE_AUTH_CLIENT_ID`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `google-auth-client-id`

Client ID for Google Sign-In.

### `MB_GOOGLE_AUTH_ENABLED`

- Type: boolean
- Default: `null`
- [Configuration file name](./config-file.md): `google-auth-enabled`

Is Google Sign-in currently enabled?

### `MB_HEALTH_CHECK_LOGGING_ENABLED`

- Type: boolean
- Default: `true`

Whether to log health check requests from session middleware.

### `MB_HELP_LINK`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: keyword
- Default: `:metabase`
- [Configuration file name](./config-file.md): `help-link`

Keyword setting to control whitelabeling of the help link. Valid values are `:metabase`, `:hidden`, and `:custom`. If `:custom` is set, the help link will use the URL specified in the `help-link-custom-destination`, or be hidden if it is not set.

### `MB_HELP_LINK_CUSTOM_DESTINATION`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `help-link-custom-destination`

Custom URL for the help link.

### `MB_HUMANIZATION_STRATEGY`

- Type: keyword
- Default: `:simple`
- [Exported as](../installation-and-operation/serialization.md): `humanization-strategy`.
- [Configuration file name](./config-file.md): `humanization-strategy`

To make table and field names more human-friendly, Metabase will replace dashes and underscores in them with spaces. We’ll capitalize each word while at it, so ‘last_visited_at’ will become ‘Last Visited At’.

### `MB_IS_METABOT_ENABLED`

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `is-metabot-enabled`

Is Metabot enabled?

### `MB_JDBC_DATA_WAREHOUSE_MAX_CONNECTION_POOL_SIZE`

- Type: integer
- Default: `15`

Maximum size of the c3p0 connection pool.

Change this to a higher value if you notice that regular usage consumes all or close to all connections.

When all connections are in use then Metabase will be slower to return results for queries, since it would have to wait for an available connection before processing the next query in the queue.

For setting the maximum, see [MB_APPLICATION_DB_MAX_CONNECTION_POOL_SIZE](#mb_application_db_max_connection_pool_size).

### `MB_JWT_ATTRIBUTE_EMAIL`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `email`
- [Configuration file name](./config-file.md): `jwt-attribute-email`

Key to retrieve the JWT users email address.

### `MB_JWT_ATTRIBUTE_FIRSTNAME`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `first_name`
- [Configuration file name](./config-file.md): `jwt-attribute-firstname`

Key to retrieve the JWT users first name.

### `MB_JWT_ATTRIBUTE_GROUPS`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `groups`
- [Configuration file name](./config-file.md): `jwt-attribute-groups`

Key to retrieve the JWT users groups.

### `MB_JWT_ATTRIBUTE_LASTNAME`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `last_name`
- [Configuration file name](./config-file.md): `jwt-attribute-lastname`

Key to retrieve the JWT users last name.

### `MB_JWT_ENABLED`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `jwt-enabled`

Is JWT authentication configured and enabled?

When set to true, will enable JWT authentication with the options configured in the MB_JWT_* variables.
        This is for JWT SSO authentication, and has nothing to do with Static embedding, which is MB_EMBEDDING_SECRET_KEY.

### `MB_JWT_GROUP_MAPPINGS`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: json
- Default: `{}`
- [Configuration file name](./config-file.md): `jwt-group-mappings`

JSON containing JWT to Metabase group mappings.

JSON object containing JWT to Metabase group mappings, where keys are JWT groups and values are lists of Metabase groups IDs.

### `MB_JWT_GROUP_SYNC`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `jwt-group-sync`

Enable group membership synchronization with JWT.

### `MB_JWT_IDENTITY_PROVIDER_URI`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `jwt-identity-provider-uri`

URL of JWT based login page.

### `MB_JWT_SHARED_SECRET`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `jwt-shared-secret`

String used to seed the private key used to validate JWT messages. A hexadecimal-encoded 256-bit key (i.e., a 64-character string) is strongly recommended.

### `MB_JWT_USER_PROVISIONING_ENABLED`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `jwt-user-provisioning-enabled`

When we enable JWT user provisioning, we automatically create a Metabase account on JWT signin for users who
don't have one.

### `MB_LANDING_PAGE`

- Type: string
- Default: ``
- [Exported as](../installation-and-operation/serialization.md): `landing-page`.
- [Configuration file name](./config-file.md): `landing-page`

Enter a URL of the landing page to show the user. This overrides the custom homepage setting above.

### `MB_LANDING_PAGE_ILLUSTRATION`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `default`
- [Exported as](../installation-and-operation/serialization.md): `landing-page-illustration`.
- [Configuration file name](./config-file.md): `landing-page-illustration`

Options for displaying the illustration on the landing page.

### `MB_LANDING_PAGE_ILLUSTRATION_CUSTOM`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Exported as](../installation-and-operation/serialization.md): `landing-page-illustration-custom`.
- [Configuration file name](./config-file.md): `landing-page-illustration-custom`

The custom illustration for the landing page.

### `MB_LDAP_ATTRIBUTE_EMAIL`

- Type: string
- Default: `mail`
- [Configuration file name](./config-file.md): `ldap-attribute-email`

Attribute to use for the user's email. (usually 'mail', 'email' or 'userPrincipalName').

### `MB_LDAP_ATTRIBUTE_FIRSTNAME`

- Type: string
- Default: `givenName`
- [Configuration file name](./config-file.md): `ldap-attribute-firstname`

Attribute to use for the user's first name. (usually 'givenName').

### `MB_LDAP_ATTRIBUTE_LASTNAME`

- Type: string
- Default: `sn`
- [Configuration file name](./config-file.md): `ldap-attribute-lastname`

Attribute to use for the user's last name. (usually 'sn').

### `MB_LDAP_BIND_DN`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `ldap-bind-dn`

The Distinguished Name to bind as (if any), this user will be used to lookup information about other users.

### `MB_LDAP_ENABLED`

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `ldap-enabled`

Is LDAP currently enabled?

### `MB_LDAP_GROUP_BASE`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `ldap-group-base`

Search base for groups. Not required for LDAP directories that provide a 'memberOf' overlay, such as Active Directory. (Will be searched recursively).

### `MB_LDAP_GROUP_MAPPINGS`

- Type: json
- Default: `{}`
- [Configuration file name](./config-file.md): `ldap-group-mappings`

JSON containing LDAP to Metabase group mappings.

### `MB_LDAP_GROUP_MEMBERSHIP_FILTER`

- Type: string
- Default: `(member={dn})`
- [Configuration file name](./config-file.md): `ldap-group-membership-filter`

Group membership lookup filter. The placeholders {dn} and {uid} will be replaced by the user's Distinguished Name and UID, respectively.

### `MB_LDAP_GROUP_SYNC`

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `ldap-group-sync`

Enable group membership synchronization with LDAP.

### `MB_LDAP_HOST`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `ldap-host`

Server hostname.

### `MB_LDAP_PASSWORD`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `ldap-password`

The password to bind with for the lookup user.

### `MB_LDAP_PORT`

- Type: integer
- Default: `389`
- [Configuration file name](./config-file.md): `ldap-port`

Server port, usually 389 or 636 if SSL is used.

### `MB_LDAP_SECURITY`

- Type: keyword
- Default: `:none`
- [Configuration file name](./config-file.md): `ldap-security`

Use SSL, TLS or plain text.

### `MB_LDAP_SYNC_USER_ATTRIBUTES`

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `ldap-sync-user-attributes`

Should we sync user attributes when someone logs in via LDAP?

### `MB_LDAP_SYNC_USER_ATTRIBUTES_BLACKLIST`

- Type: csv
- Default: `userPassword,dn,distinguishedName`
- [Configuration file name](./config-file.md): `ldap-sync-user-attributes-blacklist`

Comma-separated list of user attributes to skip syncing for LDAP users.

### `MB_LDAP_USER_BASE`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `ldap-user-base`

Search base for users. (Will be searched recursively).

### `MB_LDAP_USER_FILTER`

- Type: string
- Default: `(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))`
- [Configuration file name](./config-file.md): `ldap-user-filter`

User lookup filter. The placeholder {login} will be replaced by the user supplied login.

### `MB_LDAP_USER_PROVISIONING_ENABLED`

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `ldap-user-provisioning-enabled`

When we enable LDAP user provisioning, we automatically create a Metabase account on LDAP signin for users who
don't have one.

### `MB_LOADING_MESSAGE`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: keyword
- Default: `:doing-science`
- [Exported as](../installation-and-operation/serialization.md): `loading-message`.
- [Configuration file name](./config-file.md): `loading-message`

Choose the message to show while a query is running.

### `MB_LOGIN_PAGE_ILLUSTRATION`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `default`
- [Exported as](../installation-and-operation/serialization.md): `login-page-illustration`.
- [Configuration file name](./config-file.md): `login-page-illustration`

Options for displaying the illustration on the login page.

### `MB_LOGIN_PAGE_ILLUSTRATION_CUSTOM`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Exported as](../installation-and-operation/serialization.md): `login-page-illustration-custom`.
- [Configuration file name](./config-file.md): `login-page-illustration-custom`

The custom illustration for the login page.

### `MB_MAP_TILE_SERVER_URL`

- Type: string
- Default: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- [Configuration file name](./config-file.md): `map-tile-server-url`

The map tile server URL template used in map visualizations, for example from OpenStreetMaps or MapBox.

### `MB_METABOT_DEFAULT_EMBEDDING_MODEL`

- Type: string
- Default: `text-embedding-ada-002`

The default embeddings model to be used for metabot.

### `MB_METABOT_FEEDBACK_URL`

- Type: string
- Default: `https://amtix3l3qvitb2qxstaqtcoqby0monuf.lambda-url.us-east-1.on.aws/`
- [Configuration file name](./config-file.md): `metabot-feedback-url`

The URL to which metabot feedback is posted.

### `MB_METABOT_GET_PROMPT_TEMPLATES_URL`

- Type: string
- Default: `https://stkxezsr2kcnkhusi3fgcc5nqm0ttgfx.lambda-url.us-east-1.on.aws/`
- [Configuration file name](./config-file.md): `metabot-get-prompt-templates-url`

The URL in which metabot versioned prompt templates are stored.

### `MB_METABOT_PROMPT_GENERATOR_TOKEN_LIMIT`

- Type: integer
- Default: `6000`

When attempting to assemble prompts, the threshold at which prompt will no longer be appended to.

### `MB_NATIVE_QUERY_AUTOCOMPLETE_MATCH_STYLE`

- Type: keyword
- Default: `:substring`
- [Exported as](../installation-and-operation/serialization.md): `native-query-autocomplete-match-style`.
- [Configuration file name](./config-file.md): `native-query-autocomplete-match-style`

Matching style for native query editors autocomplete. Can be "substring", "prefix", or "off". Larger instances can have performance issues matching using substring, so can use prefix matching,  or turn autocompletions off.

### `MB_NO_DATA_ILLUSTRATION`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `default`
- [Exported as](../installation-and-operation/serialization.md): `no-data-illustration`.
- [Configuration file name](./config-file.md): `no-data-illustration`

Options for displaying the illustration when there are no results after running a question.

### `MB_NO_DATA_ILLUSTRATION_CUSTOM`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Exported as](../installation-and-operation/serialization.md): `no-data-illustration-custom`.
- [Configuration file name](./config-file.md): `no-data-illustration-custom`

The custom illustration for when there are no results after running a question.

### `MB_NO_OBJECT_ILLUSTRATION`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `default`
- [Exported as](../installation-and-operation/serialization.md): `no-object-illustration`.
- [Configuration file name](./config-file.md): `no-object-illustration`

Options for displaying the illustration when there are no results after searching.

### `MB_NO_OBJECT_ILLUSTRATION_CUSTOM`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Exported as](../installation-and-operation/serialization.md): `no-object-illustration-custom`.
- [Configuration file name](./config-file.md): `no-object-illustration-custom`

The custom illustration for when there are no results after searching.

### `MB_NOTIFICATION_LINK_BASE_URL`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`

By default "Site Url" is used in notification links, but can be overridden.

The base URL where dashboard notitification links will point to instead of the Metabase base URL.
        Only applicable for users who utilize interactive embedding and subscriptions.

### `MB_NUM_METABOT_CHOICES`

- Type: integer
- Default: `1`

Number of potential responses metabot will request. The first valid response is selected.

### `MB_OPENAI_API_KEY`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `openai-api-key`

The OpenAI API Key.

### `MB_OPENAI_MODEL`

- Type: string
- Default: `gpt-4-turbo-preview`
- [Configuration file name](./config-file.md): `openai-model`

The OpenAI Model (e.g. gpt-4-turbo-preview, gpt-4, gpt-3.5-turbo).

### `MB_OPENAI_ORGANIZATION`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `openai-organization`

The OpenAI Organization ID.

### `MB_PERSISTED_MODEL_REFRESH_CRON_SCHEDULE`

- Type: string
- Default: `0 0 0/6 * * ? *`
- [Configuration file name](./config-file.md): `persisted-model-refresh-cron-schedule`

cron syntax string to schedule refreshing persisted models.

### `MB_PERSISTED_MODELS_ENABLED`

- Type: boolean
- Default: `false`
- [Exported as](../installation-and-operation/serialization.md): `persisted-models-enabled`.
- [Configuration file name](./config-file.md): `persisted-models-enabled`

Allow persisting models into the source database.

### `MB_PREMIUM_EMBEDDING_TOKEN`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `premium-embedding-token`

Token for premium features. Go to the MetaStore to get yours!

### `MB_QUERY_ANALYSIS_ENABLED`

- Type: boolean
- Default: `true`

Whether or not we analyze any queries at all.

### `MB_QUERY_CACHING_MAX_KB`

- Type: integer
- Default: `2000`
- [Configuration file name](./config-file.md): `query-caching-max-kb`

The maximum size of the cache, per saved question, in kilobytes.

### `MB_QUERY_CACHING_MAX_TTL`

- Type: double
- Default: `3024000.0`
- [Configuration file name](./config-file.md): `query-caching-max-ttl`

The absolute maximum time to keep any cached query results, in seconds.

### `MB_REDIRECT_ALL_REQUESTS_TO_HTTPS`

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `redirect-all-requests-to-https`

Force all traffic to use HTTPS via a redirect, if the site URL is HTTPS.

### `MB_REPORT_TIMEZONE`

- Type: string
- Default: `null`
- [Exported as](../installation-and-operation/serialization.md): `report-timezone`.
- [Configuration file name](./config-file.md): `report-timezone`

Connection timezone to use when executing queries. Defaults to system timezone.

### `MB_RESET_TOKEN_TTL_HOURS`

- Type: integer
- Default: `48`

Number of hours a password reset is considered valid.

### `MB_RETRY_INITIAL_INTERVAL`

- Type: integer
- Default: `500`
- [Configuration file name](./config-file.md): `retry-initial-interval`

The initial retry delay in milliseconds.

### `MB_RETRY_MAX_ATTEMPTS`

- Type: integer
- Default: `7`
- [Configuration file name](./config-file.md): `retry-max-attempts`

The maximum number of attempts for an event.

### `MB_RETRY_MAX_INTERVAL_MILLIS`

- Type: integer
- Default: `30000`
- [Configuration file name](./config-file.md): `retry-max-interval-millis`

The maximum delay between attempts.

### `MB_RETRY_MULTIPLIER`

- Type: double
- Default: `2.0`
- [Configuration file name](./config-file.md): `retry-multiplier`

The delay multiplier between attempts.

### `MB_RETRY_RANDOMIZATION_FACTOR`

- Type: double
- Default: `0.1`
- [Configuration file name](./config-file.md): `retry-randomization-factor`

The randomization factor of the retry delay.

### `MB_SAML_APPLICATION_NAME`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `Metabase`
- [Configuration file name](./config-file.md): `saml-application-name`

This application name will be used for requests to the Identity Provider.

### `MB_SAML_ATTRIBUTE_EMAIL`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
- [Configuration file name](./config-file.md): `saml-attribute-email`

SAML attribute for the user's email address.

### `MB_SAML_ATTRIBUTE_FIRSTNAME`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname`
- [Configuration file name](./config-file.md): `saml-attribute-firstname`

SAML attribute for the user's first name.

### `MB_SAML_ATTRIBUTE_GROUP`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `member_of`
- [Configuration file name](./config-file.md): `saml-attribute-group`

SAML attribute for group syncing.

### `MB_SAML_ATTRIBUTE_LASTNAME`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname`
- [Configuration file name](./config-file.md): `saml-attribute-lastname`

SAML attribute for the user's last name.

### `MB_SAML_ENABLED`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `saml-enabled`

Is SAML authentication configured and enabled?

### `MB_SAML_GROUP_MAPPINGS`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: json
- Default: `{}`
- [Configuration file name](./config-file.md): `saml-group-mappings`

JSON containing SAML to Metabase group mappings.

### `MB_SAML_GROUP_SYNC`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `saml-group-sync`

Enable group membership synchronization with SAML.

### `MB_SAML_IDENTITY_PROVIDER_CERTIFICATE`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `saml-identity-provider-certificate`

Encoded certificate for the identity provider. Depending on your IdP, you might need to download this,
open it in a text editor, then copy and paste the certificates contents here.

### `MB_SAML_IDENTITY_PROVIDER_ISSUER`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `saml-identity-provider-issuer`

This is a unique identifier for the IdP. Often referred to as Entity ID or simply Issuer. Depending
on your IdP, this usually looks something like `http://www.example.com/141xkex604w0Q5PN724v`.

### `MB_SAML_IDENTITY_PROVIDER_URI`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `saml-identity-provider-uri`

This is the URL where your users go to log in to your identity provider. Depending on which IdP you're
using, this usually looks like `https://your-org-name.example.com` or `https://example.com/app/my_saml_app/abc123/sso/saml`.

### `MB_SAML_KEYSTORE_ALIAS`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `metabase`
- [Configuration file name](./config-file.md): `saml-keystore-alias`

Alias for the key that Metabase should use for signing SAML requests.

### `MB_SAML_KEYSTORE_PASSWORD`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `changeit`
- [Configuration file name](./config-file.md): `saml-keystore-password`

Password for opening the keystore.

### `MB_SAML_KEYSTORE_PATH`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `saml-keystore-path`

Absolute path to the Keystore file to use for signing SAML requests.

### `MB_SAML_SLO_ENABLED`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `false`
- [Configuration file name](./config-file.md): `saml-slo-enabled`

Is SAML Single Log Out enabled?

### `MB_SAML_USER_PROVISIONING_ENABLED`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `saml-user-provisioning-enabled`

When we enable SAML user provisioning, we automatically create a Metabase account on SAML signin for users who
don't have one.

### `MB_SEARCH_TYPEAHEAD_ENABLED`

- Type: boolean
- Default: `true`
- [Exported as](../installation-and-operation/serialization.md): `search-typeahead-enabled`.
- [Configuration file name](./config-file.md): `search-typeahead-enabled`

Enable typeahead search in the Metabase navbar?

### `MB_SEND_NEW_SSO_USER_ADMIN_EMAIL`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `send-new-sso-user-admin-email`

Should new email notifications be sent to admins, for all new SSO users?

### `MB_SESSION_COOKIE_SAMESITE`

- Type: keyword
- Default: `:lax`
- [Configuration file name](./config-file.md): `session-cookie-samesite`

Value for the session cookies `SameSite` directive.

See [Embedding Metabase in a different domain](../embedding/interactive-embedding.md#embedding-metabase-in-a-different-domain).
        Related to [MB_EMBEDDING_APP_ORIGIN](#mb_embedding_app_origin). Read more about [interactive Embedding](../embedding/interactive-embedding.md).
        Learn more about [SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite).

### `MB_SESSION_COOKIES`

- Type: boolean
- Default: `null`
- [Configuration file name](./config-file.md): `session-cookies`

When set, enforces the use of session cookies for all users which expire when the browser is closed.

The user login session will always expire after the amount of time defined in MAX_SESSION_AGE (by default 2 weeks).
        This overrides the “Remember me” checkbox when logging in.
        Also see the Changing session expiration documentation page.

### `MB_SESSION_TIMEOUT`

- Type: json
- Default: `null`
- [Configuration file name](./config-file.md): `session-timeout`

Time before inactive users are logged out. By default, sessions last indefinitely.

Has to be in the JSON format `"{"amount":120,"unit":"minutes"}"` where the unit is one of "seconds", "minutes" or "hours".

### `MB_SETUP_EMBEDDING_AUTOENABLED`

- Type: boolean
- Default: `false`
- [Exported as](../installation-and-operation/serialization.md): `setup-embedding-autoenabled`.
- [Configuration file name](./config-file.md): `setup-embedding-autoenabled`

Indicates if embedding has enabled automatically during the setup because the user was interested in embedding.

### `MB_SETUP_LICENSE_ACTIVE_AT_SETUP`

- Type: boolean
- Default: `false`
- [Exported as](../installation-and-operation/serialization.md): `setup-license-active-at-setup`.
- [Configuration file name](./config-file.md): `setup-license-active-at-setup`

Indicates if at the end of the setup a valid license was active.

### `MB_SHOW_DATABASE_SYNCING_MODAL`

- Type: boolean
- Default: `null`
- [Configuration file name](./config-file.md): `show-database-syncing-modal`

Whether an introductory modal should be shown after the next database connection is added. Defaults to false if any non-default database has already finished syncing for this instance.

### `MB_SHOW_HOMEPAGE_DATA`

- Type: boolean
- Default: `true`
- [Exported as](../installation-and-operation/serialization.md): `show-homepage-data`.
- [Configuration file name](./config-file.md): `show-homepage-data`

Whether or not to display data on the homepage. Admins might turn this off in order to direct users to better content than raw data.

### `MB_SHOW_HOMEPAGE_XRAYS`

- Type: boolean
- Default: `true`
- [Exported as](../installation-and-operation/serialization.md): `show-homepage-xrays`.
- [Configuration file name](./config-file.md): `show-homepage-xrays`

Whether or not to display x-ray suggestions on the homepage. They will also be hidden if any dashboards are pinned. Admins might hide this to direct users to better content than raw data.

### `MB_SHOW_METABASE_LINKS`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `true`
- [Configuration file name](./config-file.md): `show-metabase-links`

Whether or not to display Metabase links outside admin settings.

### `MB_SHOW_METABOT`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: boolean
- Default: `true`
- [Exported as](../installation-and-operation/serialization.md): `show-metabot`.
- [Configuration file name](./config-file.md): `show-metabot`

Enables Metabot character on the home page.

### `MB_SHOW_STATIC_EMBED_TERMS`

- Type: boolean
- Default: `true`
- [Exported as](../installation-and-operation/serialization.md): `show-static-embed-terms`.
- [Configuration file name](./config-file.md): `show-static-embed-terms`

Check if the static embedding licensing should be hidden in the static embedding flow.

### `MB_SITE_LOCALE`

- Type: string
- Default: `en`
- [Exported as](../installation-and-operation/serialization.md): `site-locale`.
- [Configuration file name](./config-file.md): `site-locale`

The default language for all users across the Metabase UI, system emails, pulses, and alerts. Users can individually override this default language from their own account settings.

### `MB_SITE_NAME`

- Type: string
- Default: `Metabase`
- [Exported as](../installation-and-operation/serialization.md): `site-name`.
- [Configuration file name](./config-file.md): `site-name`

The name used for this instance of Metabase.

### `MB_SITE_URL`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `site-url`

This URL is used for things like creating links in emails, auth redirects, and in some embedding scenarios, so changing it could break functionality or get you locked out of this instance.

This URL is critical for things like SSO authentication, email links, embedding and more.
        Even difference with `http://` vs `https://` can cause problems.
        Make sure that the address defined is how Metabase is being accessed.

### `MB_SLACK_APP_TOKEN`

- Type: string
- Default: `null`
- [Configuration file name](./config-file.md): `slack-app-token`

Bot user OAuth token for connecting the Metabase Slack app. This should be used for all new Slack integrations starting in Metabase v0.42.0.

### `MB_SLACK_FILES_CHANNEL`

- Type: string
- Default: `metabase_files`
- [Configuration file name](./config-file.md): `slack-files-channel`

The name of the channel to which Metabase files should be initially uploaded.

### `MB_SOURCE_ADDRESS_HEADER`

- Type: string
- Default: `X-Forwarded-For`
- [Exported as](../installation-and-operation/serialization.md): `source-address-header`.
- [Configuration file name](./config-file.md): `source-address-header`

Identify the source of HTTP requests by this headers value, instead of its remote address.

### `MB_SQL_JDBC_FETCH_SIZE`

- Type: integer
- Default: `500`

Fetch size for result sets. We want to ensure that the jdbc ResultSet objects are not realizing the entire results
  in memory.

### `MB_SQL_PARSING_ENABLED`

- Type: boolean
- Default: `true`

SQL Parsing is disabled.

### `MB_SSH_HEARTBEAT_INTERVAL_SEC`

- Type: integer
- Default: `180`
- [Configuration file name](./config-file.md): `ssh-heartbeat-interval-sec`

Controls how often the heartbeats are sent when an SSH tunnel is established (in seconds).

### `MB_START_OF_WEEK`

- Type: keyword
- Default: `:sunday`
- [Exported as](../installation-and-operation/serialization.md): `start-of-week`.
- [Configuration file name](./config-file.md): `start-of-week`

This will affect things like grouping by week or filtering in GUI queries. It won't affect most SQL queries, although it is used to set the WEEK_START session variable in Snowflake.

### `MB_SUBSCRIPTION_ALLOWED_DOMAINS`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: string
- Default: `null`
- [Exported as](../installation-and-operation/serialization.md): `subscription-allowed-domains`.
- [Configuration file name](./config-file.md): `subscription-allowed-domains`

Allowed email address domain(s) for new Dashboard Subscriptions and Alerts. To specify multiple domains, separate each domain with a comma, with no space in between. To allow all domains, leave the field empty. This setting doesn’t affect existing subscriptions.

### `MB_SURVEYS_ENABLED`

- Type: boolean
- Default: `true`

Enable or disable surveys.

### `MB_SYNCHRONOUS_BATCH_UPDATES`

- Type: boolean
- Default: `false`
- [Exported as](../installation-and-operation/serialization.md): `synchronous-batch-updates`.
- [Configuration file name](./config-file.md): `synchronous-batch-updates`

Process batches updates synchronously. If true, all `submit!` calls will be processed immediately. Default is false.

### `MB_UNAGGREGATED_QUERY_ROW_LIMIT`

- Type: integer
- Default: `2000`
- [Exported as](../installation-and-operation/serialization.md): `unaggregated-query-row-limit`.
- [Configuration file name](./config-file.md): `unaggregated-query-row-limit`

Maximum number of rows to return specifically on :rows type queries via the API.

Must be less than 1048575, and less than the number configured in MB_AGGREGATED_QUERY_ROW_LIMIT.
        This environment variable also affects how many rows Metabase returns in dashboard subscription attachments.
        See also MB_AGGREGATED_QUERY_ROW_LIMIT.

### `MB_UPLOADS_SETTINGS`

- Type: json
- Default: `null`
- [Configuration file name](./config-file.md): `uploads-settings`

Upload settings.

### `MB_USER_VISIBILITY`

> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

- Type: keyword
- Default: `:all`
- [Configuration file name](./config-file.md): `user-visibility`

Note: Sandboxed users will never see suggestions.

## Other environment variables

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

### `MB_ATTACHMENT_TABLE_ROW_LIMIT`

Type: integer<br>
Default: `20`<br>

Limits the number of rows Metabase will display in tables sent with dashboard subscriptions and alerts. Range: 1-100. To limit the total number of rows included in the file attachment for an email dashboard subscription, use [MB_UNAGGREGATED_QUERY_ROW_LIMIT](#mb_unaggregated_query_row_limit).

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


### `MB_DB_QUERY_TIMEOUT_MINUTES`

Type: integer<br>
Default: `180`

Timeout in minutes for query execution, both Metabase application database and data connections. In case you're execute a query and run into a timeout, you might consider increasing this value.


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

### `MB_SESSION_COOKIE_SAMESITE`

Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.<br>
Type: string (`"none"`, `"lax"`, `"strict"`)<br>
Default: `"lax"`

See [Embedding Metabase in a different domain](../embedding/interactive-embedding.md#embedding-metabase-in-a-different-domain).

Related to [MB_EMBEDDING_APP_ORIGIN](#mb_embedding_app_origin). Read more about [interactive Embedding](../embedding/interactive-embedding.md).

Learn more about SameSite cookies: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite

### `MB_SESSION_COOKIES`

Type: boolean<br>
Default: `null`

When set to `true`, the user login session will expire when the browser is closed. The user login session will always expire after the amount of time defined in [MAX_SESSION_AGE](#max_session_age) (by default 2 weeks).

This overrides the "Remember me" checkbox when logging in.

Also see the [Changing session expiration](../people-and-groups/changing-session-expiration.md) documentation page.

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

