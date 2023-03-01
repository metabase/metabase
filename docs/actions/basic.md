---
title: Basic actions
---

# Basic actions

Basic actions are premade [actions](./introduction.md) that do things that people typically want to do when interacting with a database.

Basic actions auto-track the schema of primary source table backing the model. By auto-track the schema, we mean that Metabase will create forms for people to fill out that include all of the fields in the model from the primary source table that underlies that model, and the action will update whenever you change the model. Basic actions are only available for models that include a single primary key.

Custom columns are also excluded because they are computed columns; if you want to change a custom column's values, you should update the values in the columns used to compute that column.

If you only want to give people the option to update a subset of columns, you can write a [custom action](./custom.md).

## Creating basic actions

Once actions are enabled, you can create basic actions on a new or existing [model](../data-modeling/models.md).

1. Select a model and click on the **info** button, then click on **Model detail**.
2. On the model detail page, click on the **Actions** tab.
3. Click on the **...** next to the **New Action** and select **Create basic actions**.

## Basic action types

![Basic actions](./images/basic-actions.png)

Basic actions include:

- [Update](#update)
- [Delete](#delete)
- [Create](#create)

By default, none of the input fields are required for basic actions.

### Update

The update action will present people with a form with editable fields for each column in the primary source table that's also included in the model. So if the model's source table has columns a, b, c, and d, but the model only includes columns a, b, and c, then the form will only show input fields for columns a, b, and c.

When setting up an update action on a dashboard, you can either prompt the person to fill in a value for each field, or have a field automatically filled in via parameters (such as values set in dashboard filters).

### Delete

The Delete action will create a form that prompts people for an ID, and will delete the record (row) in the underlying table that backs the model.

### Create

The Create actions is the `INSERT INTO` action. The Create action will present a form with editable fields for each column in the primary source table that's also included in the model. So if the model's source table has columns a, b, c, and d, but the model only includes columns a, b, and c, then the form will only show input fields for columns a, b, and c.

Once filled out, the action will insert the record into the primary table that underlies the model.

## Basic actions on dashboards

When setting up actions on a dashboard, you can either prompt the person to fill in a value for each field, or have a field automatically filled in via parameters (such as values set in dashboard filters). See [Actions in dashboards](../dashboards/actions.md).

## Archiving basic actions

Because basic actions are made of magic, you cannot archive them. You can just toggle them on or off. From the model detail page, next the **New action** button, click on the **...** menu and click **Disable basic actions**.

## Further reading

- [Introduction to actions](./introduction.md)
- [Custom actions](./custom.md)
