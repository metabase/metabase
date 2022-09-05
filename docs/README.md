---
title: Metabase documentation
redirect_from:
  - /docs/latest/enterprise-guide
  - /docs/latest/users-guide
  - /docs/latest/administration-guide
  - /docs/latest/operations-guide
---

## Getting started

- [Getting started](https://www.metabase.com/learn/getting-started/getting-started)
- [A tour of Metabase](https://www.metabase.com/learn/getting-started/tour-of-metabase)

## Troubleshooting and getting help

- [Troubleshooting guides](troubleshooting-guide/index.md)
- [Metabase forum](https://discourse.metabase.com/)
- [Configuring logging](./configuring-metabase/log-configuration.md)

## Tutorials and guides

- [Learn Metabase](https://www.metabase.com/learn) has a ton of articles on how to use Metabase and level up as a data analyst.

## Installation and operation

- [Overview](./installation-and-operation/start.md)
- [Installing Metabase](./installation-and-operation/installing-metabase.md)
- [How to upgrade Metabase](./installation-and-operation/upgrading-metabase.md)
- [Application database](./installation-and-operation/configuring-application-database.md)
- [Backing up Metabase](./installation-and-operation/backing-up-metabase-application-data.md)
- [Migrating to a production application database](./installation-and-operation/migrating-from-h2.md)
- [A word on Java versions](./installation-and-operation/java-versions.md)
- [How to setup monitoring via JMX](./installation-and-operation/monitoring-metabase.md)
- [Serialization: copying one Metabase instance to another](./installation-and-operation/serialization.md)
- [Supported browsers](./installation-and-operation/supported-browsers.md)
- [Some info on privacy and GDPR](./installation-and-operation/privacy.md)

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
- [SQL snippet folder permissions](./permissions/snippets.md)

### Sharing

- [Sharing answers](./questions/sharing/answers.md)
- [Visualizing data](./questions/sharing/visualizing-results.md)
- [Setting and getting alerts](./questions/sharing/alerts.md)
- [Public links](./questions/sharing/public-links.md)

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

- [Overview](./exploration-and-organization/start.md)
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

- [Overview](./embedding/start.md)
- [Embedding introduction](./embedding/introduction.md)
- [Signed embedding](./embedding/signed-embedding.md)
- [Full-app embedding](./embedding/full-app-embedding.md)
- [Embedding example apps](https://github.com/metabase/embedding-reference-apps)

## Databases

- [Overview](./databases/start.md)
- [Adding data sources](./databases/connecting.md)
- [Encrypting your database connection](./databases/encrypting-details-at-rest.md)
- [SSH tunneling](./databases/ssh-tunnel.md)
- [SSL certificate](./databases/ssl-certificates.md)

## Configuring Metabase

- [Overview](./configuring-metabase/start.md)
- [Setting up Metabase](./configuring-metabase/setting-up-metabase.md)
- [Settings](./configuring-metabase/settings.md)
- [Email](./configuring-metabase/email.md)
- [Slack](./configuring-metabase/slack.md)
- [Environment variables](./configuring-metabase/environment-variables.md)
- [Configuring logging](./configuring-metabase/log-configuration.md)
- [Handling timezones](./configuring-metabase/timezones.md)
- [Localization](./configuring-metabase/localization.md)
- [Appearance](./configuring-metabase/appearance.md)
- [Caching query results](./configuring-metabase/caching.md)
- [Custom map settings](./configuring-metabase/custom-maps.md)
- [Customizing the Metabase Jetty Webserver](./configuring-metabase/customizing-jetty-webserver.md)

## Usage and performance tools

- [Overview](./usage-and-performance-tools/start.md)
- [Auditing tools](./usage-and-performance-tools/audit.md)
- [Tracking query errors](./usage-and-performance-tools/tools.md)

## Metabase API

- [API reference](./api-documentation.md)
- [API tutorial](https://www.metabase.com/learn/administration/metabase-api)

## Premium features

The Enterprise and Pro plans of Metabase offer additional features.

- [Overview](./paid-features/start.md)
- [Getting and activating the Enterprise edition](./paid-features/activating-the-enterprise-edition.md)
- [List of premium features](./paid-features/overview.md)

## Metabase community

- [Metabase forum](https://discourse.metabase.com/)
- [Community stories](https://www.metabase.com/community)
- [Case studies](https://www.metabase.com/case_studies/)
- [Metabase Blog](https://www.metabase.com/blog)
- [Source code repository on GitHub](https://github.com/metabase/metabase)

## [Developers guide](developers-guide/start.md)

Contribute to the Metabase open source project!

## [Metabase Cloud](https://www.metabase.com/cloud/docs)

## [Data and Business Intelligence Glossary](https://www.metabase.com/glossary)

Data jargon explained.
