---
title: Migrating from legacy permissions
---

# Migrating from legacy permissions

In Metabase 50, we overhauled our data permissions system to make it more expressive and easier to reason about. This page explains what changed and why.

**The TL;DR: we split the old Data access setting into two settings: [View data](./data.md#can-view-data-permission) and [Create Queries](./data.md#create-queries-permissions). Your data permissions may look different, but the access hasn't changed.**

## How Metabase migrated your permissions

If you're migrating from Metabase 50 or earlier, Metabase will (with [one exception](#the-no-self-service-deprecated-view-access-level)) automatically update your permissions to the new system. While group permissions will be slightly different (and we hope easier to reason about), your groups will have the same levels of access as before.

## Why we updated our permissions system

The original Data access permission setting contained five levels of access: unrestricted, impersonated, granular, no self-service, and block. These levels aren’t at the same axis. They combined on one axis, whether you could view data, and on another axis, whether you could query that data. This created a two-dimensional setting:

- **No self-service.** Restricts groups from using the query builder to create or edit questions.
- **Sandbox and block.** Restricts view _and_ query builder access to the underlying data.

Mixing two axes (querying + viewing) to a single permissions setting could yield unexpected behavior. For example, by changing access from "Sandboxed" to "No self-service", an admin might think that they would be _restricting_ that group's access to data. But in that case, the group could potentially see _more_ data, provided the group also had access to collections with existing models, questions, or dashboards.

## What our overhaul of data permissions accomplishes

- Splits [view access](./data.md#view-data-permissions) and [query access](./data.md#create-queries-permissions) into two permission dimensions.
- Makes permissions easier to reason about. A more restrictive permission never gives more access than a less restrictive one.

## Migration table from old permissions to new

This table is just if you're interested in Metabase archeologically. Metabase handles the migration for you.

Before, Metabase had **Data access** and **Native query editing**. Now, Metabase has [View data](./data.md#view-data-permissions) and [Create queries](./data.md#create-queries-permissions). Here's how Metabase migrated each pairing to the new system.

| **Data access**            | **Native query editing** | **>** | **View data**        | **Create queries**            |
| -------------------------- | ------------------------ | ----- | -------------------- | ----------------------------- |
| Unrestricted               | Yes                      | **>** | Can view             | Query builder and native code |
| Unrestricted               | No                       | **>** | Can view             | Query builder                 |
| No self-service            | No                       | **>** | Can view             | No                            |
| Blocked                    | No                       | **>** | Blocked              | No                            |
| Impersonated               | Yes                      | **>** | Impersonated         | Query builder and native code |
| Impersonated               | No                       | **>** | Impersonated         | Query builder                 |
| Unrestricted (granular)    | No                       | **>** | Can view             | Query builder (granular)      |
| Sandboxed (granular)       | No                       | **>** | Sandboxed (granular) | Query builder (granular)      |
| No self-service (granular) | No                       | **>** | Can view             | No (granular)                 |

## The `No self-service (deprecated)` View access level

If you see the `No self-service (deprecated)` permission setting in **View data** for any group, you should manually change it at some point.

For any group that has their **View data** access set to `No self-service (deprecated)`, you'll need to change the **View data** permission to one of the new types:

- [Can view](./data.md#can-view-data-permission)
- [Impersonated](./data.md#impersonated-view-data-permission)
- [Sandboxed](./data.md#sandboxed-view-data-permission)
- [Blocked](./data.md#blocked-view-data-permission)

Please make the change soon, but don't stress about it: if you take no action, Metabase will change any groups with View data access set to `No self-service (deprecated)` to `Blocked` in a future release. We're defaulting to "Blocked", the least permissive View data access, to prevent any unintended access to data.

Why we couldn't migrate this setting manually: in the old permissions system, consider people in multiple groups.

- **Unrestricted** data access meant that blocks, sandboxes, or impersonations from your other groups DO NOT affect you.
- **No Self Service** data access meant that blocks, sandboxes, or impersonations from your other groups DO affect you.

Say you have the following groups in the old permissions framework:

|                 | **Group A**  | **Group B**     | **Group C** | **Group D** | **Group E**  |
| --------------- | ------------ | --------------- | ----------- | ----------- | ------------ |
| **Data Access** | Unrestricted | No self-service | Blocked     | Sandboxed   | Impersonated |

If you’re a member of Group A and one of Group C, D, or E, you’ll have full, unrestricted access to the data, with no blocks, sandboxes, or impersonations applied.

If you’re a member of Group B and one of Group C, D, or E, you’ll have limited access to the data: either blocked, sandboxed, or impersonated.

We could migrate the permissions like so:

|                    | **Group A**        | **Group B** | **Group C** | **Group D**        | **Group E**        |
| ------------------ | ------------------ | ----------- | ----------- | ------------------ | ------------------ |
| **View data**      | Can view           | ?           | Blocked     | Sandboxed          | Impersonated       |
| **Create queries** | Query Builder only | No          | No          | Query Builder only | Query Builder only |

We can't really make a call on what Group B's View data should be. If we switch it to **Can view**, the person won't be affected by the blocked, sandboxed, or impersonated settings in their other group. If we set it to **Blocked**, they could lose access to that data. So we created an interim setting, `No self-service (legacy)` to manage this (temporarily) awkward transition.

## Further reading

- [Data permissions](./data.md)
