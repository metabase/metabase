---
title: Introduction to model actions
redirect_from:
  - /docs/latest/actions/introduction
---

# Introduction to model actions

> We recommend [data actions](../../data-actions.md) over model actions. Data actions don't need a model. Create a model action only when you need to run the action from a [button on a dashboard](../../../dashboards/actions.md).

> Model actions only work on [PostgreSQL and MySQL](../../data-actions.md#databases-that-support-data-actions).

![Example action](./images/example-action.png)

## What are model actions?

**Actions** are entities in Metabase that let you build custom forms and business logic. **Model actions** are actions that belong to a [model](../models.md).

Model actions let you write parameterized SQL that writes back to your database. You can attach model actions to [buttons on dashboards](../../../dashboards/actions.md) to create custom workflows. You can even publicly share the parameterized forms that actions generate to collect data.

Here are a few ideas for what you can do with model actions:

- Mark the customer you’re viewing in a dashboard as a VIP.
- Let team members remove redundant data.
- Create a customer feedback form and embed it on your website.

Model actions only run on the raw tables in your database, so they never edit your [model definition](../../../data-modeling/models/models.md#edit-a-models-query).

If you're an admin who just wants to edit data in your tables, check out [Editable table data](../../../data-modeling/editable-tables.md).

## Enabling model actions for a database

To use model actions on a database, an admin has to turn on data actions for it. The setting covers model actions too. See [Turn on data actions for a database](../../data-actions.md#turn-on-data-actions-for-a-database).

Model actions also need a model. Create at least one model on the database before you create model actions.

## Who can use model actions

- **To create, edit, or delete a model action**, you must be an admin. But people with Curate access to a model's collection can delete the model's actions by [moving the model to the trash](#deleting-a-model-deletes-its-actions).
- **To run a model action**, all you need is view access to the action's model (or a link to a public action). To run an action from a [dashboard button](../../../dashboards/actions.md), you also need view access to the dashboard. But people with [row and column security](../../../permissions/row-and-column-security.md#people-with-row-and-column-security-cant-run-actions) on any table in a database can't run actions on that database.

## Types of model actions

There are two types of model actions:

- [Basic](./basic.md)
- [Custom](./custom.md)

## Running model actions

There are multiple ways to run model actions:

- [From the model details page](../../../data-modeling/models/models.md#model-details) by clicking the **run** button.
- From a [public form](./custom.md#make-public) of an action.
- From a [button on dashboard](../../../dashboards/actions.md).

## Deleting a model deletes its actions

A model's actions don't outlive the model. Metabase deletes all of a model's actions, and the dashboard buttons that use them, when someone:

- Moves the model to the trash.
- Moves the collection that the model is in to the trash.
- Turns the model back into a saved question.

This includes people who aren't admins: anyone with [Curate access](../../../permissions/collections.md#curate-access) to the model's collection can do these things.

Restoring the model from the trash doesn't bring its actions back.

[Data actions](../../data-actions.md) don't belong to a model, so they work differently: when you archive a data actions folder, Metabase archives its actions too, and unarchiving the folder brings them back. See [Archive and unarchive data actions](../../data-actions.md#archive-and-unarchive-data-actions).

## Auditing actions

{% include plans-blockquote.html feature="Usage analytics" %}

Metabase records every action run in the [Query log](../../../usage-and-performance-tools/usage-analytics-reference.md#query-log) model in your Usage analytics collection.

## Actions change data in tables, which affect models

Just something to clarify here: actions, even when they belong to models, make their changes to the underlying table that a model queries. Which means that anyone who has access to the underlying table, or to questions or other models based on that table, will be able to see the effects of an action. Tools other than Metabase that are connected to that database will also pick up these changes.

In this sense, models are containers for actions; models are a way to organize actions. In fact, you could (in theory) add a [custom action](./custom.md) to a model that performs some update unrelated to its model's data. For example, you could write a custom action that updates the `Accounts` table, and add that action to a model that only queries an unrelated table (e.g., the `Orders` table). But, you know, maybe don't do that (unless you have a good reason). [Basic actions](./basic.md), however, are only available for models that wrap a single raw table.

Before using actions in production, consider playing around with actions on some sample data (like the Sample Database included with Metabase) to get a feel for how they work.

## Action gotchas

- If caching is enabled for the relevant table or model, you may not see the effects of an action in Metabase until Metabase refreshes the data (though you can always manually refresh the data).
- When creating records on a table that lacks an automatically generated primary key, you'll need to input an available ID (i.e., an ID not already in use by another record).
- You can't "undo" actions. You can, however, create and run an action to recreate a deleted record, or change an updated record back to its original values (provided you know the original values).
- Actions are unavailable for public dashboards and dashboards in [guest embeds](../../../embedding/guest-embedding.md). To use actions in embeds, you can use [modular embedding](../../../embedding/modular-embedding.md) with SSO or [full app embedding](../../../embedding/full-app-embedding.md).

## Further reading

- [Data actions](../../data-actions.md)
- [Basic actions](./basic.md)
- [Custom actions](./custom.md)
- [Actions in dashboards](../../../dashboards/actions.md)
