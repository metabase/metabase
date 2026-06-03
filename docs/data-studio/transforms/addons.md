---
title: Transform add-ons
summary: Metabase transforms come in two flavors - basic transforms for basic query-based functionality, and advanced transforms for Python workflows, transform inspector, and other functionality.
---

# Transform add-ons

At a glance:

[**Basic transforms**](#basic-transforms):

- Run [query-based transforms](query-transforms.md)
- Schedule transform [jobs](jobs-and-runs.md).
- (Pro/Enterprise only) Configure [permissions for transforms](transforms-overview.md#permissions-for-transforms).

[**Advanced transforms**](#advanced-transforms):

- Run [query-based](query-transforms.md) and [Python transforms](python-transforms.md);
- Schedule transform [jobs](jobs-and-runs.md).
- (Pro/Enterprise only) Configure [permissions for transforms](transforms-overview.md#permissions-for-transforms).
- [Writable connection](../../databases/writable-connection.md): separate database connection used for write operations.
- [Transform inspector](transform-inspector.md).

Availability and pricing depends on your plan and hosting method.

## Basic transforms

With basic transforms, you can:

- Write and run [query-based transforms](query-transforms.md) (but not Python transforms).
- [Schedule and run jobs](jobs-and-runs.md).
- (Pro/Enterprise only) Configure [permissions for transforms](transforms-overview.md#permissions-for-transforms).

### Enable basic transforms

- **Self-hosted Metabases**: Basic transform functionality is included on self-hosted Metabases by default. Just log into your Metabase, [enable transforms](../transforms/transforms-overview.md#enable-transforms), and you're good to go.

- **Metabase Cloud**: Basic transform functionality on Metabase Cloud - Starter, Pro, or Enterprise - comes with an additional small fee per successful transform run, see [Pricing](https://www.metabase.com/pricing).

    Only people logged in with an email of a [Metabase Store admin](../../cloud/accounts-and-billing.md#add-managers) (not just Metabase _instance_ admins) can [enable basic transforms](./transforms-overview.md#enable-transforms).

### Cancel basic transforms

Once basic transforms are enabled on your Metabase Cloud instance, they can't be disabled.

## Advanced transforms

Advanced transforms include:

- Everything in [basic transforms](#basic-transforms).
- [Python transforms](python-transforms.md) for more flexible data processing.
- [Writable connection](../../databases/writable-connection.md): separate database connection used for write operations.
- [Transform inspector](transform-inspector.md).

You can buy the Advanced transforms add-on for:

- Any Metabase Cloud instance (Starter, Pro, Enterprise)
- Self-hosted Pro or Enterprise instances.

  Currently, you can't use Advanced transforms functionality on Open Source self-hosted plans.

The Advanced transforms add-on comes with an additional charge per successful transform run (compare to [Basic transforms](#basic-transforms)). See [Pricing](https://www.metabase.com/pricing).

### Enable Advanced transforms

To enable Advanced transforms functionality, you need to have [Basic transforms](#basic-transforms) already, see [Enable basic transforms](#enable-basic-transforms).

There are two ways to enable Advanced transforms:

- **From your Metabase instance**: you can navigate to a feature requiring advanced transforms (like Python transforms or transform inspector), and follow the prompts to upgrade.

  To enable Advanced transforms from your Metabase instance, you need to be logged into the instance with the same email as a [Metabase Store admin](../../cloud/accounts-and-billing.md#add-managers), because Advanced transform incur an additional charge.

- **From [Metabase Store](https://store.metabase.com)**:

  1. Log into [Metabase Store](https://store.metabase.com) (your Metabase Store account might be different from your Metabase instance account).
  2. Click on **Manage plan** next to the instance where you'd like to add Advanced transforms.
  3. Under **Manage Add-ons**, find **Advanced transforms** and click **Upgrade**.

Once you upgrade to Advanced transforms:

- You get access to Advanced transforms features/
- All your existing query-based transforms will be charged at Advanced transforms rate.

### Cancel Advanced transforms

You can downgrade from Advanced transforms to [Basic transforms](#basic-transforms).

1. Log into [Metabase Store](https://store.metabase.com) (your Metabase Store account might be different from your Metabase instance account).
2. Click on **Manage plan** next to the instance with Advanced transforms.
3. Under **Manage Add-ons**, find **Advanced transforms**, click **three dos** and select **Downgrade to basic**.

Once you downgrade from advanced transforms:

- Your Python transforms will no longer run and will be removed.
- Transforms and other write features will stop using the writable connection (if you had one configured.)

## How billing works for transforms

Unless you're on an Enterprise plan, transforms - either basic (on Metabase Cloud) or advanced - are billed based on the number of successful runs. See [Jobs and runs](jobs-and-runs.md) for more on transform runs, and [Pricing](https://www.metabase.com/pricing) for up-to-date information on pricing.

When you upgrade from basic to advanced transforms, _all_ your transforms will be billed at advanced transforms rate.

If you're on an Enterprise plan and have questions about billing, [contact us](https://www.metabase.com/help-premium).
