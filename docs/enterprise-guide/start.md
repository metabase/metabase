# Enterprise and Pro editions

The [Enterprise and Pro][pricing] editions of Metabase provide additional features that help organizations scale Metabase and deliver self-service, embedded analytics.

## Setting up

Metabase Pro is hosted, so you should already be setup with all the paid features, but you may have to activate a Metabase Enterprise edition to access all the features.

- [Getting and activating the Enterprise edition](activating-the-enterprise-edition.html)

## Authentication

Paid plans include more ways to authenticate people and manage groups.

- [Authenticating with SAML](authenticating-with-saml.html)
  - [Setting up SAML with Auth0](saml.html)
  - [Setting up SAML with Google](saml-google.html)
  - [Setting up SAML with Keycloak](saml-keycloak.html)
  - [Okta documentation](https://developer.okta.com/docs/guides/saml-application-setup/overview/)
  - [OneLogin documentation](https://onelogin.service-now.com/support?id=kb_article&sys_id=83f71bc3db1e9f0024c780c74b961970)
- [Authenticating with JWT](authenticating-with-jwt.html)

## Permissions

Paid plans include more ways to manage permissions, including data sandboxing, which brings row and column-level permissions to Metabase.

- [Data sandboxes](data-sandboxes.html)
- [Block permissions](../administration-guide/data-permissions.html#block-access)
- [SQL snippet controls](sql-snippets.html)
- [Application permissions](../administration-guide/application-permissions.html)

## Embedding

You can embed all of Metabase in your app.

- [Embedding the entire Metabase app in your app](full-app-embedding.html)
- [Customizing how Metabase looks with white labeling](whitelabeling.html)

## Dashboard subscription customization

Send different groups of people the contents of the dashboard with different filters applied. You only need to maintain one dashboard, which you can use to send results relevant to each subscriber.

- [Customizing filter values for each dashboard subscription](dashboard-subscriptions.html)

## Official collections

You can mark certain collections as [official](../users-guide/collections.html#official-collections), which helps people find your most important questions, dashboards, and models.

## Question moderation

People can ask administrators to verify their questions.

- [Question moderation](../users-guide/06-sharing-answers.html#question-moderation)

## Advanced caching controls

All Metabase editions include global caching controls. Paid plans includes additional caching options that let you control caching for individual questions.

- [Caching controls for individual questions](../users-guide/06-sharing-answers.html#caching-results)

## Auditing

See how people are using your Metabase.

- [Using the audit logs](audit.html)

## Admin tools

See which queries are failing to help keep your Metabase tidy.

- [Tracking query errors](tools.html)

## Serialization

You can export Metabase application data and use that to spin up new instances preloaded with questions, dashboards, and collections.

- [Serialization](serialization.html)

[pricing]: https://www.metabase.com/pricing/
