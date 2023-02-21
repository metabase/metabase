---
title: Basic actions
---

# Basic actions

Basic actions are premade [actions](./introduction.md) that do things that people typically want to do when interacting with a database.

Basic actions auto-track the schema of the model they're associated with. By auto-track the schema, we mean that Metabase will create forms for people to fill out that include all of the model's columns, excluding custom columns. Custom columns are excluded because they are computed columns; if you want to change a custom column's values, you should update the values in the columns used to compute that column.

## Creating basic actions

Once actions are enabled, you can create basic actions on a new or existing [model](../data-modeling/models.md).

1. Select a model and click on the **info** button, then click on **Model detail**.
2. On the model detail page, click on the **Actions** tab.
3. Click on the **...** next to the **New Action** and select **Create basic actions**. 

## Basic actions

Basic actions include:

- Update
- Delete 
- Create

By default, none of the input fields are required for basic actions.

### Update

The update action will present people with a form with editable fields for each column in the model (excluding custom columns). 

When setting up an update action on a dashboard, you can either prompt the user to fill in a value for each field, or have a field automatically filled in via parameters (such as values set in dashboard filters). 

### Create

The Create actions is the `INSERT INTO` action. The Create action will present a form with editable fields for all of the columns in the model (excluding custom columns). Once filled out, the action will insert the record into the table(s) that underlie the model. 

## Archiving basic actions

You cannot archive basic actions, you can just toggle them on or off. From the model detail page, next the **New action** button, click on the **...** menu and click **Disable basic actions**. 

## Further reading

- [Introduction to actions](./introduction.md)
- [Custom actions](./custom.md)
