---
title: Transform add-ons
---

# Transform tiers and add-ons

Metabase comes with two tiers of transform functionality:

- **Basic transforms**: run [query-based transforms](query-transforms.md) and schedule transform [jobs](jobs-and-runs.md).
- **Advanced transforms**: both query-based and Python transforms; separate database connection for write operations; transform inspector.

Availability and pricing depends on your plan and hosting method.

## Basic transforms

With basic transform functionality, you can:

- Write and run [query-based transforms](query-transforms.md) (but not Python transforms).
- [Schedule and run jobs](jobs-and-runs.md).
- (Pro/Enterprise only) Configure [permissions for transforms](transforms-overview.md#permissions-for-transforms).

### Enable basic transforms

- **Self-hosted Metabases**: Basic transform functionality is included on self-hosted Metabases by default. Just log into your Metabase, [enable transforms](../transforms/transforms-overview.md#enable), and you're good to go.

- **Metabase Cloud**: Basic transform functionality on Metabase Cloud - Starter, Pro, or Enterprise - comes with an additional small fee per successful transform run, see [Pricing](https://www.metabase.com/pricing).

  Only people logged in with an email of a [Metabase Store admins](../../cloud/accounts-and-billing.md#add-people-to-manage-your-metabase-store-account) (not just Metabase _instance_ admins) can enable basic transforms. To enable Basic transforms on Metabase Cloud, see [Enable transforms](./transforms-overview.md#enable-transforms).

### Disable basic transforms

Once basic transforms are enabled on your Metabase Cloud instance, they can't be disabled.

## Advanced transforms

Advanced transform functionality includes:

- All [basic transform](#basic-transforms) functionality: query-based transforms, scheduled jobs, and transform permissions (on Pro/Enterprise).
- [Python transforms](python-transforms.md) for more flexible data processing.
- [Writable connection](../../databases/writable-connection.md) - separate database connection used for write operations.
- [Transform inspector](transform-inspector.md).

Advanced transforms functionality can be added to:

- Any Metabase Cloud instance (Starter, Pro, Enterprise)
- Self-hosted Pro or Enterprise instances.

  Currently, you can't use Advanced transforms functionality on Open Source self-hosted plans.

Advanced transforms add-on comes with an additional charge per successful transform run (compare to [Basic transforms](#basic-transforms)). See [Pricing](https://www.metabase.com/pricing).

### Enable Advanced transforms

To enable Advanced transforms functionality, you need to have [Basic transforms](#basic-transforms) already.

There are two ways to enable Advanced transforms:

- **From your Metabase instance**: you can navigate to a feature requiring advanced transforms (like Python transforms or transform inspector), and follow the prompts to upgrade.

  To enable Advanced transforms from your Metabase instance, you need to be logged into the instance with the same email as a [Metabase Store admin](../../cloud/accounts-and-billing.md#add-people-to-manage-your-metabase-store-account), because Advanced transform incur an additional charge.

- **From [Metabase Store](https://store.metabase.com)**:

  1. Log into Metabase Store.
  2. Click on **Manage plan** next to the instance where you'd like to add Advanced transforms.
  3. Under **Manage Add-ons**, find **Advanced transforms** and click **Upgrade**.

### Disable Advanced transforms

You can downgrade from Advanced transforms to [Basic transforms](#basic-transforms).

## How billing works for transforms

Unless you're on an Enterprise plan, transforms - either basic (on Metabase Cloud) or advanced - are billed based on the number of successful runs. See [Jobs and runs](jobs-and-runs.md) for more on transform runs, and [Pricing](https://www.metabase.com/pricing) for up-to-date information on pricing.

When you upgrade from basic to advanced transforms, _all_ your transforms will be billed at advanced transforms rate.

If you're on an Enterprise plan and have questions about billing, [contact us](https://www.metabase.com/help-premium).
