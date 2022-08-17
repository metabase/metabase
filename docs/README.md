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
- [Default formatting](./data-modeling/formatting.md)
- [Creating segments and metrics](./data-modeling/segments-and-metrics.md)

## Finding things and keeping organized

- [Basic exploration](./exploration-and-organization/exploration.md)
- [Collections](./exploration-and-organization/collections.md)
- [Events and timelines](./exploration-and-organization/events-and-timelines.md)

## People and groups

- [Overview](./people-and-groups/start.md)
- [Editing your account settings](./people-and-groups/account-settings.md)
- [Managing people and groups](./people-and-groups/managing.md)
- [Password complexity](./people-and-groups/changing-password-complexity.md)
- [Session expiration](./people-and-groups/changing-session-expiration.md)
- [Google Sign-In or LDAP](./people-and-groups/google-and-ldap.md)

### Paid SSO options

- [JWT](./people-and-groups/authenticating-with-jwt.md)
- [SAML](./people-and-groups/authenticating-with-saml.md)
  - [Auth0](./people-and-groups/saml-auth0.md)
  - [Azure AD](./people-and-groups/saml-azure.md)
  - [Google](./people-and-groups/saml-google.md)
  - [Keycloak](./people-and-groups/saml-keycloak.md)
  - [Okta](./people-and-groups/saml-okta.md)

## Permissions

- [Overview](./permissions/start.md)
- [Permissions introduction](./permissions/introduction.md)
- [Data permissions](./permissions/data.md)
- [Collection permissions](./permissions/collections.md)
- [Application permissions](./permissions/application.md)
- [Sandboxing data based on user attributes](./permissions/data-sandboxes.md)
- [SQL snippets folder permissions](./permissions/snippets.md)

## Embedding questions and dashboards

- [Embedding overview](./embedding/start.md)
- [Embedding Metabase in other applications](./embedding/introduction.md)
- [Public links for dashboards and questions](./embedding/public-links.md)
- [Customizing the appearance of embedded items](./enterprise-guide/customize-embeds.md)
- [Embedding the entire Metabase app in your own web app](./embedding/full-app-embedding.md)
- [White labeling charts (branding)](./embedding/whitelabeling.md)
- [Embedding example apps](https://github.com/metabase/embedding-reference-apps)

## Databases

- [Overview](./databases/start.md)
- [Adding data sources](./databases/connecting.md)
- [Encrypting your database connection](./databases/encrypting-details-at-rest.md)
- [SSH tunneling](./databases/ssh-tunnel.md)
- [SSL certificate](./databases/ssl-certificates.md)

## Configuring Metabase

- [Overview](./configuring-metabase/start.md)
- [Settings](./configuring-metabase/settings.md)
- [Email](./configuring-metabase/email.md)
- [Slack](./configuring-metabase/slack.md)
- [Environment variables](./configuring-metabase/environment-variables.md)
- [Handling timezones](./configuring-metabase/timezones.md)
- [Localization](./configuring-metabase/localization.md)
- [Caching query results](./configuring-metabase/caching.md)
- [Custom map settings](./configuring-metabase/custom-maps.md)
- [Customizing the Metabase Jetty Webserver](./configuring-metabase/customizing-jetty-webserver.md)

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
