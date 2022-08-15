---
title: Metabase documentation
---

## Getting started

- [Getting started](/learn/getting-started/getting-started)
- [A tour of Metabase](/learn/getting-started/tour-of-metabase)

## Troubleshooting and getting help

- [Troubleshooting guides](troubleshooting-guide/index.md)
- [Metabase forum](https://discourse.metabase.com/)
- [Configuring logging](./operations-guide/log-configuration.md)

## Tutorials and guides

- [Learn Metabase](/learn) has a ton of articles on how to use Metabase and level up as a data analyst.

## Installation and operation

- [Installing Metabase](./operations-guide/installing-metabase.md)
- [Setting up Metabase](setting-up-metabase.md)
- [How to upgrade Metabase](./operations-guide/upgrading-metabase.md)
- [Application database](./operations-guide/configuring-application-database.md)
- [Backing up Metabase](./operations-guide/backing-up-metabase-application-data.md)
- [Migrating to a production application database](./operations-guide/migrating-from-h2.md)
- [Running database migrations manually](./operations-guide/running-migrations-manually.md)
- [A word on Java versions](./operations-guide/java-versions.md)
- [How to setup monitoring via JMX](./operations-guide/jmx-monitoring.md)
- [Serialization: copying one Metabase instance to another](./enterprise-guide/serialization.md)
- [Supported browsers](./administration-guide/supported-browsers.md)

## Asking questions

- [Overview](./questions/start.md)

### Query builder

- [Asking questions](./questions/query-builder/introduction.md)
- [Custom expressions](./questions/query-builder/expressions.md)
- [List of expressions: aggregations and functions](./questions/query-builder/expressions-list.md)
- [Joining data](./questions/query-builder//join.md)

### SQL and native queries

- [The native SQL editor](./questions/native-editor/writing-sql.md)
- [Viewing metadata](./questions/native-editor/data-model-reference.md)
- [SQL templates](./questions/native-editor/sql-parameters.md)
- [Using results to ask new questions](./questions/native-editor/referencing-saved-questions-in-queries.md)
- [SQL snippets](./questions/native-editor/sql-snippets.md)
- [SQL snippet permissions](./questions/native-editor/snippet-permissions.md)

### Sharing

- [Sharing answers](./questions/sharing/answers.md)
- [Visualizing data](./questions/sharing/visualizing-results.md)
- [Setting and getting alerts](./questions/sharing/alerts.md)

## Dashboards

- [Overview](./dashboards/start.md)
- [Creating dashboards](./dashboards/introduction.md)
- [Dashboard filters](./dashboards/filters.md)
- [Interactive dashboards](./dashboards/interactive.md)
- [Dashboard charts with multiple series](./dashboards/multiple-series.md)
- [Setting up dashboard subscriptions](./dashboards/subscriptions.md)

## Data modeling

- [Overview](./data-modeling/start.md)
- [Models](./data-modeling/models.md)
- [Metadata-editing](./data-modeling/metadata-editing.md)
- [Field types](./data-modeling/field-types.md)
- [Creating segments and metrics](./data-modeling/segments-and-metrics.md)

## Finding things and keeping organized

- [Basic exploration](./users-guide/03-basic-exploration.md)
- [Sharing and organizing your saved questions](./users-guide/06-sharing-answers.md)
- [Collections](./users-guide/collections.md)
- [Events and timelines](./users-guide/events-and-timelines.md)

## People and groups

- [Editing your account settings](./users-guide/account-settings.md)
- [Managing people and groups](./administration-guide/04-managing-users.md)
- [Single Sign-on (SSO)](./administration-guide/sso.html)
  - [Google Sign-In or LDAP](./administration-guide/10-single-sign-on.html)
  - [SAML](./enterprise-guide/authenticating-with-saml.html)
  - [JWT](./enterprise-guide/authenticating-with-jwt.html)
- [Password complexity](./operations-guide/changing-password-complexity.md)
- [Session expiration](./operations-guide/changing-session-expiration.md)

## Permissions

- [Permissions overview](./administration-guide/05-setting-permissions.md)
- [Data permissions](./administration-guide/data-permissions.md)
- [Collection permissions](./administration-guide/06-collections.md)
- [Application permissions](./administration-guide/application-permissions.md)
- [Sandboxing data based on user attributes](./enterprise-guide/data-sandboxes.md)
- [SQL snippets folder permissions](./enterprise-guide/sql-snippets.md)

## Embedding questions and dashboards

- [Public links for dashboards and questions](./administration-guide/12-public-links.md)
- [Embedding Metabase in other applications](./administration-guide/13-embedding.md)
- [Customizing the appearance of embedded items](./enterprise-guide/customize-embeds.md)
- [Embedding the entire Metabase app in your own web app](./enterprise-guide/full-app-embedding.md)
- [Embedding example apps](https://github.com/metabase/embedding-reference-apps)
- [White labeling charts (branding)](./enterprise-guide/whitelabeling.md)

## Databases

- [Overview](./databases/start.md)
- [Adding data sources](./databases/connecting.md)
- [Encrypting your database connection](./databases/encrypting-details-at-rest.md)
- [SSH tunneling](./databases/ssh-tunnel.md)
- [SSL certificate](./databases/ssl-certificates.md)

## Configuring Metabase

- [Settings](./administration-guide/08-configuration-settings.md)
- [Email](./administration-guide/02-setting-up-email.md)
- [Slack](./administration-guide/09-setting-up-slack.md)
- [Environment variables](./operations-guide/environment-variables.md)
- [Handling timezones](./operations-guide/handling-timezones.md)
- [Customizing the Metabase Jetty Webserver](./operations-guide/customizing-jetty-webserver.md)
- [Default formatting](./administration-guide/19-formatting-settings.md)
- [Localization](./administration-guide/localization.md)
- [Caching query results](./administration-guide/14-caching.md)
- [Custom map settings](./administration-guide/20-custom-maps.md)

## Usage and performance tools

- [Auditing tools](./enterprise-guide/audit.md)
- [Tracking query errors](./enterprise-guide/tools.md)

## Metabase API

- [API reference](./api-documentation.md)
- [API tutorial](/learn/administration/metabase-api)

## Paid plans

The Enterprise and Pro plans of Metabase offer additional features.

- [Getting and activating the Enterprise edition](./enterprise-guide/activating-the-enterprise-edition.md)
- [List of premium features](enterprise-guide/start.md)

## Metabase community

- [Metabase forum](https://discourse.metabase.com/)
- [Community stories](/community)
- [Case studies](https://www.metabase.com/case_studies/)
- [Metabase Blog](/blog)
- [Source code repository on GitHub](https://github.com/metabase/metabase)

## Documentation guides

- [Users guide](users-guide/start.md)
- [Admin guide](administration-guide/start.md)
- [Operations guide](operations-guide/start.md)
- [Troubleshooting guide](troubleshooting-guide/index.md)
- [Developers guide](developers-guide/start.md)

## Metabase Cloud

- [Docs specific to our hosted version](/cloud/docs)

## Privacy

- [Some info on privacy and GDPR](privacy.md)

## Reference

- [Anonymous Information Collection Reference](information-collection.md)
- [Data and Business Intelligence Glossary](/glossary)
