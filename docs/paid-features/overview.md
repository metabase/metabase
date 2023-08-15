---
title: Overview of premium features
redirect_from:
  - /docs/latest/enterprise-guide/start
---

# Overview of premium features

Metabase's [Enterprise and Pro](https://www.metabase.com/pricing) plans provide additional features that help organizations scale Metabase and deliver self-service internal or embedded analytics.

- **If you're on Metabase Cloud**, your paid features will activate automatically.
- **If you're self-hosting,** you'll need to [activate your license](./activating-the-enterprise-edition.md).

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
- [Download permissions](../permissions/data.md#download-results)
- [Connection impersonation](../permissions/data.md#impersonation-access)
- [Database management permissions](../permissions/data.md#manage-database)
- [Table metadata management permissions](../permissions/data.md#manage-table-metadata)

## People and group management

- [Group managers](../people-and-groups/managing.md#group-managers)

## Embedding

You can embed all of Metabase in your app.

- [Embedding the entire Metabase app in your app](../embedding/interactive-embedding.md)
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md)

## Dashboard subscription customization

Send different groups of people the contents of the dashboard with different filters applied. You only need to maintain one dashboard, which you can use to send results relevant to each subscriber.

- [Customizing filter values for each dashboard subscription](../dashboards/subscriptions.md)

## Restrict which domains people can send alerts and subscriptions to

As an additional security layer, you can whitelist domains, which restricts people from sending alerts and subscriptions to email addresses that don't use an approved domain.

- [Approved domains for notifications](../configuring-metabase/settings.md#approved-domains-for-notifications)

## Content moderation tools

Tools for keeping your Metabase organized, so people can find your most important, verified items.

- [Official collections](../exploration-and-organization/collections.md#official-collections)
- [Verified items](../exploration-and-organization/exploration.md#verified-items)

## Advanced caching controls

All Metabase editions include global caching controls. Paid plans includes additional caching options that let you control caching for individual questions.

- [Caching controls for individual questions](../configuring-metabase/caching.md#caching-per-question)
- [Caching control per database](../configuring-metabase/caching.md#caching-per-database)

## Auditing

See how people are using your Metabase.

- [Using the audit logs](../usage-and-performance-tools/audit.md)

## Admin tools

See which queries are failing to help keep your Metabase tidy.

- [Tracking query errors](../usage-and-performance-tools/tools.md)

## Serialization

You can export Metabase application data and use that to spin up new instances preloaded with questions, dashboards, and collections.

- [Serialization](../installation-and-operation/serialization.md)

## Configuration file

For self-hosted installations, you can load Metabase from a [configuration file](../configuring-metabase/config-file.md).
