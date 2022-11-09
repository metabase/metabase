---
title: Overview of premium features
redirect_from:
  - /docs/latest/enterprise-guide/start
---

# Overview of premium features

Metabase's [Enterprise and Pro](https://www.metabase.com/pricing) plans provide additional features that help organizations scale Metabase and deliver self-service, embedded analytics.

## Setting up

Metabase Pro is hosted, so you should already be setup with all the paid features, but you may have to activate a Metabase Enterprise edition to access all the features.

- [Getting and activating the Enterprise edition](activating-the-enterprise-edition.md)

## Authentication

Paid plans include more ways to authenticate people and manage groups.

- [Authenticating with SAML](../people-and-groups/authenticating-with-saml.md)
  - [Setting up SAML with Auth0](../people-and-groups/saml-auth0.md)
  - [Setting up SAML with Azure AD](../people-and-groups/saml-azure.md)
  - [Setting up SAML with Google](../people-and-groups/saml-google.md)
  - [Setting up SAML with Keycloak](../people-and-groups/saml-keycloak.md)
  - [Setting up SAML with Okta](../people-and-groups/saml-okta.md)
- [Authenticating with JWT](../people-and-groups/authenticating-with-jwt.md)

## Permissions

Paid plans include more ways to manage permissions, including data sandboxing, which brings row and column-level permissions to Metabase.

- [Data sandboxes](../permissions/data-sandboxes.md)
- [Block permissions](../permissions/data.md#block-access)
- [SQL snippet folder permissions](../permissions/snippets.md)
- [Application permissions](../permissions/application.md)

## Embedding

You can embed all of Metabase in your app.

- [Embedding the entire Metabase app in your app](../embedding/full-app-embedding.md)
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md)

## Dashboard subscription customization

Send different groups of people the contents of the dashboard with different filters applied. You only need to maintain one dashboard, which you can use to send results relevant to each subscriber.

- [Customizing filter values for each dashboard subscription](../dashboards/subscriptions.md)

## Official collections

You can mark certain collections as [official](../exploration-and-organization/collections.md#official-collections), which helps people find your most important questions, dashboards, and models.

## Question moderation

People can ask administrators to verify their questions and models.

- [Verified items](../exploration-and-organization/exploration.md#verified-items)

## Advanced caching controls

All Metabase editions include global caching controls. Paid plans includes additional caching options that let you control caching for individual questions.

- [Caching controls for individual questions](../questions/sharing/answers.md#caching-results)

## Auditing

See how people are using your Metabase.

- [Using the audit logs](../usage-and-performance-tools/audit.md)

## Admin tools

See which queries are failing to help keep your Metabase tidy.

- [Tracking query errors](../usage-and-performance-tools/tools.md)

## Serialization

You can export Metabase application data and use that to spin up new instances preloaded with questions, dashboards, and collections.

- [Serialization](../installation-and-operation/serialization.md)
