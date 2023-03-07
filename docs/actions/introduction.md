---
title: Introduction to actions
---

# Introduction to actions

> For now, actions are only available for PostgreSQL, MySQL, and H2 

![Example action](./images/example-action.png)

**Actions** are entities in Metabase that let you build custom forms and business logic.

## What are actions?

Actions let you write parameterized SQL that writes back to your database. Actions can be attached to [buttons on dashboards](../dashboards/actions.md) to create custom workflows. You can even publicly share the parameterized forms they generate to collect data.

Here are a few ideas for what you can do with actions:

- Create a customer feedback form and embed it on your website.
- Mark the customer you’re viewing in a dashboard as a VIP.
- Let team members remove redundant data.

Actions are associated with [models](../data-modeling/models.md), but actions operate on the raw tables that back those models (actions don't directly affect models).

## Enabling actions

To enable actions for a database connection, admins should click on the gear icon in the upper right and navigate to **Admin settings** > **Databases**, then click on the database you want to create actions for. On the right side of the connection settings form, toggle the **Model actions** option. 

For actions to work, the database user account (the account you're using to connect to the database) must have write permissions. And for now, actions are only supported on PostgreSQL, MySQL, and H2 databases.

## Who can use actions

Actions are associated with models, so you'll need to have created (or have access to) at least one model before you can start using actions.

- **To create or edit an action**, a person must be in a group with Native query editing privileges for the relevant database.
-  **To run an action**, all you need is view access to the action's model or dashboard (or a link to a public action).

## Types of actions

There are two types of actions:

- [Basic](./basic.md)
- [Custom](./custom.md)

## Running actions

There are multiple ways to run actions:

- [From the model details page](../data-modeling/models.md#model-detail-page) by clicking the **run** button.
- From a [public form](./custom.md#make-public) of an action.
- From a [button on dashboard](../dashboards/actions.md).

