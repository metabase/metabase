---
title: Actions
---

# Actions

> For now, actions are only available for PostgreSQL and MySQL

Actions are entities in Metabase that let you build custom forms and business logic.

## What are actions?

Actions let you write parameterized SQL that can then be attached to buttons, clicks, or even added on the page as form elements.

Use actions to update your data based on user input or values on the page.

Have fun, and try not to break anything.

## Enabling actions

To enable actions for a database connection, admins should click on the gear icon in the upper right and navigate to **Admin settings** > **Databases**, then click on the database you want to create actions for. On the right side of the connection settings form, toggle the **Model actions** option.

For actions to work, the database user account (the account you're using to connect to the database) must have write permissions.

## Who can use actions

**To create or edit an action**, a person must be in a group with Native query editing privileges for the relevant database.
**To run an action**, all you need is view access to the action's model or dashboard.

## Types of actions

There are two types of actions:

- [Basic](./basic.md)
- [Custom](./custom.md)

## Actions on dashboards

See [Actions on dashboards](../dashboards/actions.md).

## Action settings

When in the action editor, click on the gear icon to bring up the action settings.

### Make public

Creates a publicly shareable link to the action form.

### Set a success message

Here you can edit the success message, which is the message Metabase will display in the toast that pops up after Metabase hears back from the database that everything went smoothly.

If something goes wrong, Metabase will display the error message it received from the database.
