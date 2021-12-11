## Getting started

- [Getting started][getting-started]
- [A tour of Metabase][tour]

## Tutorials and guides

- [Learn Metabase][learn] has a ton of articles on how to use Metabase and level up as a data analyst.

## Installation and operation

- [Installing Metabase](./operations-guide/installing-metabase.html)
- [How to upgrade Metabase](./operations-guide/upgrading-metabase.html)
- [Application database](./operations-guide/configuring-application-database.html)
- [Backing up Metabase](./operations-guide/backing-up-metabase-application-data.html)
- [Migrating to a production application database](./operations-guide/migrating-from-h2.html)
- [Running database migrations manually](./operations-guide/running-migrations-manually.html)
- [A word on Java versions](./operations-guide/java-versions.html)
- [How to setup monitoring via JMX](./operations-guide/jmx-monitoring.html)
- [Serialization: copying one Metabase instance to another](./enterprise-guide/serialization.html)

## Asking questions

### Query builder

- [Simple questions](./users-guide/04-asking-questions.html)
- [Custom questions](./users-guide/custom-questions.html)
- [Custom expressions](./users-guide/expressions.html)
- [List of expressions: aggregations and functions](./users-guide/expressions-list.html)
- [Visualizing data](./users-guide/05-visualizing-results.html)
- [Using results to ask new questions](./users-guide/referencing-saved-questions-in-queries.html)

### SQL and native queries

- [The native SQL editor](./users-guide/writing-sql.html)
- [Viewing metadata](./users-guide/12-data-model-reference.html)
- [SQL templates](./users-guide/13-sql-parameters.html)
- [SQL snippets](./users-guide/sql-snippets.html)

### Alerts and Metabot

- [Setting and getting alerts](./users-guide/15-alerts.html)
- [Get answers in Slack with Metabot](./users-guide/11-metabot.html)

## Dashboards

- [Creating dashboards](./users-guide/07-dashboards.html)
- [Dashboard filters](./users-guide/08-dashboard-filters.html)
- [Interactive dashboards](./users-guide/interactive-dashboards.html)
- [Dashboard charts with multiple series](./users-guide/09-multi-series-charting.html)
- [Setting up dashboard subscriptions](./users-guide/dashboard-subscriptions.html)

## Collections

- [Sharing and organizing your saved questions](./users-guide/06-sharing-answers.html)
- [Collections](./users-guide/collections.html)

## People and groups

- [Editing your account settings](./users-guide/account-settings.html)
- [Managing people and groups](./administration-guide/04-managing-users.html)
- [Google Sign-In or LDAP](./administration-guide/10-single-sign-on.html)
- [SAML](./enterprise-guide/authenticating-with-saml.html)
- [JWT](./enterprise-guide/authenticating-with-jwt.html)
- [Password complexity](./operations-guide/changing-password-complexity.html)
- [Session expiration](./operations-guide/changing-session-expiration.html)

## Permissions

- [Data permissions](./administration-guide/05-setting-permissions.html)
- [Collection permissions](./administration-guide/06-collections.html)
- [Sandboxing data based on user attributes](./enterprise-guide/data-sandboxes.html)
- [SQL snippets folder permissions](./enterprise-guide/sql-snippets.html)

## Embedding questions and dashboards

- [Public links for dashboards and questions](./administration-guide/12-public-links.html)
- [Embedding Metabase in other applications](./administration-guide/13-embedding.html)
- [Embedding the entire Metabase app in your own web app](./enterprise-guide/full-app-embedding.html)
- [Embedding example apps][embedding-ref-apps]
- [White labeling charts (branding)](./enterprise-guide/whitelabeling.html)

## Databases

- [Adding data sources](./administration-guide/01-managing-databases.html)
- [Encrypting your database connection](./operations-guide/encrypting-database-details-at-rest.html)
- [Editing your database metadata](./administration-guide/03-metadata-editing.html)
- [Creating segments and metrics](./administration-guide/07-segments-and-metrics.html)
- [SSH tunneling](./administration-guide/ssh-tunnel-for-database-connections.html)
- [SSL certificate](./administration-guide/secure-database-connections-with-ssl-certificates.html)

## Configuring Metabase

- [Settings](./administration-guide/08-configuration-settings.html)
- [Email](./administration-guide/02-setting-up-email.html)
- [Slack](./administration-guide/09-setting-up-slack.html)
- [Environment variables](./operations-guide/environment-variables.html)
- [Handling timezones](./operations-guide/handling-timezones.html)
- [Customizing the Metabase Jetty Webserver](./operations-guide/customizing-jetty-webserver.html)
- [Default formatting](./administration-guide/19-formatting-settings.html)
- [Localization](./administration-guide/localization.html)
- [Caching query results](./administration-guide/14-caching.html)
- [Custom map settings](./administration-guide/20-custom-maps.html)

## Usage and performance tools

- [Auditing tools](./enterprise-guide/audit.html)
- [Tracking query errors](./enterprise-guide/tools.html)

## Metabase API

- [API reference][api-documentation]
- [API tutorial][api-tutorial]

## Troubleshooting and getting help

- [Troubleshooting guide][troubleshooting] 
- [Metabase forum][forum]
- [Configuring logging](./operations-guide/log-configuration.html)

## Enterprise and Pro editions

- [Getting and activating the Enterprise edition](./enterprise-guide/activating-the-enterprise-edition.html)
- [List of premium features][enterprise]

## Metabase community

- [Metabase forum][forum]
- [Data Bytes][data-bytes]
- [Case studies][case-studies]
- [Blog][blog]
- [Source code repository on GitHub][source-code]

## Documentation guides

- [Users guide](users-guide/start.html)
- [Admin guide](administration-guide/start.html)
- [Operations guide](operations-guide/start.html)
- [Troubleshooting guide][troubleshooting] 
- [Developers guide][developers]

## Reference

- [Anonymous Information Collection Reference][info-collection]
- [FAQs][faq]
- [Glossary][glossary]

[api-documentation]: ./api-documentation.html
[api-tutorial]: /learn/administration/metabase-api.html
[admin-guide]: administration-guide/start.html
[blog]: /blog
[case-studies]: https://www.metabase.com/case_studies/
[embedding-ref-apps]: https://github.com/metabase/embedding-reference-apps
[enterprise]: enterprise-guide/start.html
[enterprise-landing]: /enterprise
[data-bytes]: /community
[developers]: developers-guide/start.html
[drivers]: developers-guide-drivers.html
[faq]: faq/start.html
[forum]: https://discourse.metabase.com/
[getting-started]: /learn/getting-started/getting-started.html
[glossary]: /glossary.html
[info-collection]: information-collection.html
[learn]: /learn
[operations-guide]: operations-guide/start.html
[source-code]: https://github.com/metabase/metabase
[tour]: /learn/getting-started/tour-of-metabase.html
[troubleshooting]: troubleshooting-guide/index.html
[users-guide]: users-guide/start.html

