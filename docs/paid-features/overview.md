---
title: Overview of premium features
redirect_from:
  - /docs/latest/enterprise-guide/start
---

# Overview of premium features

Metabase's [Enterprise and Pro](https://www.metabase.com/pricing) plans provide additional features that help organizations scale Metabase and deliver self-service internal or embedded analytics.

- **If you're on Metabase Cloud**, your Pro/Enterprise features will activate automatically.
- **If you're self-hosting,** you'll need to [activate your license](./activating-the-enterprise-edition.md).

## Authentication and provisioning

Pro and Enterprise plans include more ways to authenticate people and manage groups.

- [Authenticating with SAML](../people-and-groups/authenticating-with-saml.md)
  - [Setting up SAML with Auth0](../people-and-groups/saml-auth0.md)
  - [Setting up SAML with Microsoft Entra ID](../people-and-groups/saml-azure.md)
  - [Setting up SAML with Google](../people-and-groups/saml-google.md)
  - [Setting up SAML with Keycloak](../people-and-groups/saml-keycloak.md)
  - [Setting up SAML with Okta](../people-and-groups/saml-okta.md)
- [Authenticating with JWT](../people-and-groups/authenticating-with-jwt.md)
- [Multiple domains with Google Sign-in](../people-and-groups/google-sign-in.md#multiple-domains-for-google-sign-in)
- [LDAP group membership filter](../people-and-groups/ldap.md#ldap-group-membership-filter)
- [LDAP sync user attributes](../people-and-groups/ldap.md#syncing-user-attributes-with-ldap)
- [User provisioning with SCIM](../people-and-groups/user-provisioning.md)

## Permissions

Pro and Enterprise plans include more ways to manage permissions, including data sandboxing, which brings row and column-level permissions to Metabase.

- [Data sandboxes](../permissions/data-sandboxes.md)
- [Blocked view data permissions](../permissions/data.md#blocked-view-data-permission)
- [SQL snippet folder permissions](../permissions/snippets.md)
- [Application permissions](../permissions/application.md)
- [Download permissions](../permissions/data.md#download-results-permissions)
- [Connection impersonation](../permissions/data.md#impersonated-view-data-permission)
- [Database management permissions](../permissions/data.md#manage-database-permissions)
- [Table metadata management permissions](../permissions/data.md#manage-table-metadata-permissions)

## People and group management

Delegate group membership managemnet by assigning [group managers](../people-and-groups/managing.md#group-managers).

## Appearance

[White-label Metabase's appearance](../configuring-metabase/appearance.md).

## Embedding

Some embedding tools are paid features.

### Interactive embedding

[Embed the entire Metabase app in your app](../embedding/interactive-embedding.md).

### Embedded analytics SDK (BETA)

[Embed Metabase components in your app](../embedding/sdk/introduction.md).

## Dashboard subscription and alert customization

- [Customizing filter values for each dashboard subscription](../dashboards/subscriptions.md).
- [Approved domains for notifications](../configuring-metabase/email.md#approved-domains-for-notifications).
- [Recipient suggestion controls](../configuring-metabase/email.md#suggest-recipients-on-dashboard-subscriptions-and-alerts).

## Content moderation tools

Tools for keeping your Metabase organized, so people can find your most important, verified items.

- [Official collections](../exploration-and-organization/collections.md#official-collections)
- [Verified items](../exploration-and-organization/content-verification.md)

## Advanced caching controls

All Metabase editions include global caching controls. Pro and Enterprise plans includes additional caching options that let you control caching for individual questions.

- [Caching questions](../configuring-metabase/caching.md#question-caching-policy)
- [Caching dashboards](../configuring-metabase/caching.md#dashboard-caching-policy)
- [Caching databases](../configuring-metabase/caching.md#database-caching-policy)

## Model persistence for individual models

[Toggle persistence for individual models](../data-modeling/model-persistence.md#turn-on-model-persistence-for-individual-models).

## Usage analytics

[See how people are using your Metabase](../usage-and-performance-tools/usage-analytics.md).

## Admin tools

See which queries are failing to help keep your Metabase tidy.

- [Tracking query errors](../usage-and-performance-tools/tools.md)
- [Deleting uploaded tables](../databases/uploads.md#deleting-tables-created-by-uploads)

## Serialization

You can [export Metabase application data](../installation-and-operation/serialization.md) and use that to spin up new instances preloaded with questions, dashboards, and collections.

## Configuration file

For self-hosted installations, you can load Metabase from a [configuration file](../configuring-metabase/config-file.md).
